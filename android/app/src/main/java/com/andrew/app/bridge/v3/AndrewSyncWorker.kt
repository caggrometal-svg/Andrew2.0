package com.andrew.app.bridge.v3

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.security.MessageDigest
import java.util.Base64
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream

class AndrewSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val signer = DeviceKeyStoreSigner()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val sync = getJson(SYNC_PATH)
            if (!sync.optBoolean("ok", false)) return@withContext Result.retry()
            val artifact = sync.optJSONObject("artifact") ?: return@withContext Result.success()
            val revisionId = requireRevision(artifact.getString("revisionId"))
            val previousRevisionId = artifact.optString("previousRevisionId").takeIf { it.isNotBlank() }
            val expectedSha256 = artifact.getString("sha256Hex").lowercase()
            require(expectedSha256.matches(Regex("[0-9a-f]{64}"))) { "invalid artifact digest" }
            val signatureBase64 = artifact.getString("signatureBase64")
            val downloadUrl = artifact.getString("downloadUrl")
            require(downloadUrl.startsWith("https://")) { "artifact download must use HTTPS" }

            val root = File(applicationContext.filesDir, SANDBOX_ROOT).apply { mkdirs() }
            val staging = File(root, ".staging-$revisionId-${id}")
            val active = File(root, ACTIVE_DIR)
            val previous = File(root, PREVIOUS_DIR)
            staging.deleteRecursively()
            staging.mkdirs()

            val archive = File(staging, "artifact.zip")
            download(downloadUrl, archive)
            val digest = sha256(archive)
            require(digest == expectedSha256) { "artifact digest mismatch" }
            verifyArtifactSignature(digest, signatureBase64)

            val payload = File(staging, "payload")
            payload.mkdirs()
            unzipSafely(archive, payload)
            archive.delete()
            healthcheck(payload, revisionId)

            val stagedRevision = File(root, "revision-$revisionId")
            stagedRevision.deleteRecursively()
            atomicMove(payload.toPath(), stagedRevision.toPath())
            staging.deleteRecursively()

            if (active.exists()) {
                previous.deleteRecursively()
                atomicMove(active.toPath(), previous.toPath())
            }
            atomicMove(stagedRevision.toPath(), active.toPath())
            writeAtomicPointer(File(root, ACTIVE_POINTER), revisionId)
            writeAtomicPointer(File(root, PREVIOUS_POINTER), previousRevisionId ?: readPointer(File(root, PREVIOUS_POINTER)) ?: "")

            val ackOk = acknowledge(revisionId, true, null)
            if (!ackOk) return@withContext Result.retry()
            Result.success()
        } catch (rollbackFailure: Throwable) {
            runCatching { rollback() }
            runCatching { acknowledge(inputData.getString(KEY_REVISION_ID), false, "healthcheck_failed") }
            Result.failure()
        }
    }

    private fun getJson(path: String): JSONObject {
        val response = signedRequest("GET", path, null)
        require(response.code in 200..299) { "sync HTTP ${response.code}" }
        return JSONObject(response.body)
    }

    private fun download(url: String, destination: File) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = NETWORK_TIMEOUT_MS
            readTimeout = NETWORK_TIMEOUT_MS
            instanceFollowRedirects = false
        }
        try {
            require(connection.responseCode in 200..299) { "artifact HTTP ${connection.responseCode}" }
            BufferedInputStream(connection.inputStream).use { input ->
                FileOutputStream(destination).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                    output.fd.sync()
                }
            }
        } finally { connection.disconnect() }
    }

    private fun signedRequest(method: String, path: String, body: String?): HttpResponse {
        val signed = signer.signCanonical(System.currentTimeMillis(), path)
        val connection = (URL(BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = NETWORK_TIMEOUT_MS
            readTimeout = NETWORK_TIMEOUT_MS
            setRequestProperty("X-Device-Id", signed.deviceId)
            setRequestProperty("X-Timestamp", signed.timestamp)
            setRequestProperty("X-Signature", signed.signatureBase64)
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val bytes = (if (connection.responseCode >= 400) connection.errorStream else connection.inputStream)?.use { it.readBytes() } ?: ByteArray(0)
            return HttpResponse(connection.responseCode, bytes.toString(StandardCharsets.UTF_8))
        } finally { connection.disconnect() }
    }

    private suspend fun acknowledge(revisionId: String?, ok: Boolean, error: String?): Boolean {
        if (revisionId.isNullOrBlank()) return false
        val body = JSONObject().apply { put("revisionId", revisionId); put("ok", ok); if (error != null) put("error", error) }.toString()
        var attempt = 0
        while (attempt < ACK_ATTEMPTS) {
            attempt += 1
            val response = runCatching { signedRequest("POST", ACK_PATH, body) }.getOrNull()
            if (response != null && response.code in 200..299) return true
            if (attempt < ACK_ATTEMPTS) delay(ACK_BASE_DELAY_MS shl (attempt - 1))
        }
        return false
    }

    private fun verifyArtifactSignature(sha256Hex: String, signatureBase64: String) {
        val encodedPublicKey = applicationContext.packageManager.getApplicationInfo(applicationContext.packageName, android.content.pm.PackageManager.GET_META_DATA).metaData?.getString(ARTIFACT_PUBLIC_KEY_META)
            ?: error("artifact signing public key is not configured")
        val publicKey = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(encodedPublicKey)))
        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(publicKey)
        verifier.update(hexToBytes(sha256Hex))
        require(verifier.verify(Base64.getDecoder().decode(signatureBase64))) { "artifact signature invalid" }
    }

    private fun healthcheck(payload: File, revisionId: String) {
        val health = File(payload, "health.json")
        require(health.isFile) { "sandbox health manifest missing" }
        val json = JSONObject(health.readText())
        require(json.optBoolean("ok", false)) { "sandbox healthcheck failed" }
        require(json.optString("revisionId") == revisionId) { "sandbox revision mismatch" }
    }

    private fun rollback() {
        val root = File(applicationContext.filesDir, SANDBOX_ROOT)
        val active = File(root, ACTIVE_DIR)
        val previous = File(root, PREVIOUS_DIR)
        if (!previous.isDirectory) return
        val failed = File(root, ".failed-${System.currentTimeMillis()}")
        if (active.exists()) atomicMove(active.toPath(), failed.toPath())
        atomicMove(previous.toPath(), active.toPath())
        failed.deleteRecursively()
        writeAtomicPointer(File(root, ACTIVE_POINTER), readPointer(File(root, PREVIOUS_POINTER)) ?: "")
    }

    private fun atomicMove(source: Path, target: Path) {
        Files.move(source, target, StandardCopyOption.ATOMIC_MOVE)
    }

    private fun writeAtomicPointer(target: File, value: String) {
        val temp = File(target.parentFile, ".${target.name}.${id}.tmp")
        FileOutputStream(temp).use { stream -> stream.write(value.toByteArray(StandardCharsets.UTF_8)); stream.fd.sync() }
        atomicMove(temp.toPath(), target.toPath())
    }

    private fun readPointer(file: File): String? = file.takeIf { it.isFile }?.readText()?.trim()?.takeIf { it.isNotEmpty() }
    private fun requireRevision(value: String): String { require(value.matches(Regex("[A-Za-z0-9._-]{1,128}"))); return value }
    private fun sha256(file: File): String { val digest = MessageDigest.getInstance("SHA-256"); FileInputStream(file).use { input -> val buffer = ByteArray(64 * 1024); while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) } }; return digest.digest().joinToString("") { "%02x".format(it) } }
    private fun hexToBytes(value: String): ByteArray = ByteArray(value.length / 2) { index -> value.substring(index * 2, index * 2 + 2).toInt(16).toByte() }

    private fun unzipSafely(zip: File, destination: File) {
        ZipInputStream(BufferedInputStream(FileInputStream(zip))).use { input ->
            var entry: ZipEntry? = input.nextEntry
            val buffer = ByteArray(64 * 1024)
            while (entry != null) {
                val relative = entry.name.replace('\\', '/')
                require(relative.isNotBlank() && !relative.startsWith('/') && relative.split('/').none { it == ".." }) { "unsafe zip path" }
                val target = File(destination, relative).canonicalFile
                require(target.path.startsWith(destination.canonicalPath + File.separator) || target.path == destination.canonicalPath) { "zip path escapes staging" }
                if (entry.isDirectory) target.mkdirs() else {
                    target.parentFile?.mkdirs()
                    FileOutputStream(target).use { output -> while (true) { val count = input.read(buffer); if (count < 0) break; output.write(buffer, 0, count) } }
                }
                input.closeEntry()
                entry = input.nextEntry
            }
        }
    }

    private data class HttpResponse(val code: Int, val body: String)

    companion object {
        private const val BASE_URL = "https://andrew2-api.onrender.com"
        private const val SYNC_PATH = "/api/v1/bridge/v3/sync"
        private const val ACK_PATH = "/api/v1/bridge/v3/ack"
        private const val SANDBOX_ROOT = "andrew_web_sandbox"
        private const val ACTIVE_DIR = "active"
        private const val PREVIOUS_DIR = "previous"
        private const val ACTIVE_POINTER = "active_revision"
        private const val PREVIOUS_POINTER = "previous_revision"
        private const val ARTIFACT_PUBLIC_KEY_META = "andrew_bridge_artifact_public_key_spki"
        private const val NETWORK_TIMEOUT_MS = 30_000
        private const val ACK_ATTEMPTS = 4
        private const val ACK_BASE_DELAY_MS = 1_000L
        private const val KEY_REVISION_ID = "revisionId"
    }
}
