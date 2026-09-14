package com.andrew.app.bridge.v3

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

class AndrewBridgeCommandWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val signer = DeviceKeyStoreSigner()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val response = request("GET", COMMANDS_PATH, null)
            if (response.code !in 200..299) return@withContext Result.retry()
            val commands = JSONObject(response.body).optJSONArray("commands") ?: JSONArray()
            for (index in 0 until commands.length()) {
                val command = commands.optJSONObject(index) ?: continue
                process(command)
            }
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }

    private fun process(command: JSONObject) {
        val id = command.optString("id", "")
        val name = command.optString("command", "")
        if (id.isBlank()) return
        try {
            BridgeCommandPolicy.requireAllowed(name)
            when (name) {
                "sync_web_artifact", "sync_now" -> {
                    val request = OneTimeWorkRequest.Builder(AndrewSyncWorker::class.java).build()
                    WorkManager.getInstance(applicationContext).enqueueUniqueWork(SYNC_WORK, ExistingWorkPolicy.REPLACE, request)
                    result(id, name, true, JSONObject().put("scheduled", true))
                }
                "set_runtime_parameter" -> {
                    val runtime = applyRuntimeParameter(command.optJSONObject("payload"))
                    result(id, name, true, runtime)
                }
                "request_status" -> {
                    val root = applicationContext.filesDir.resolve("andrew_web_sandbox")
                    val revision = root.resolve("active_revision").takeIf { it.isFile }?.readText()?.trim().orEmpty()
                    result(id, name, true, JSONObject().put("activeRevision", revision).put("sandboxActive", root.resolve("active").isDirectory))
                }
                "open_settings" -> {
                    val intent = Intent(Settings.ACTION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    applicationContext.startActivity(intent)
                    result(id, name, true, JSONObject().put("opened", true).put("action", Settings.ACTION_SETTINGS))
                }
                "health_check" -> {
                    val root = applicationContext.filesDir.resolve("andrew_web_sandbox")
                    val active = root.resolve("active")
                    val revision = root.resolve("active_revision").takeIf { it.isFile }?.readText()?.trim().orEmpty()
                    result(id, name, active.isDirectory, JSONObject().put("sandboxActive", active.isDirectory).put("activeRevision", revision), if (!active.isDirectory) "healthcheck_failed" else null)
                }
                "rollback_web_artifact" -> {
                    val root = applicationContext.filesDir.resolve("andrew_web_sandbox")
                    val active = root.resolve("active")
                    val previous = root.resolve("previous")
                    if (!previous.isDirectory) throw IllegalStateException("previous artifact unavailable")
                    val failed = root.resolve(".command-rollback-${System.currentTimeMillis()}")
                    if (active.exists()) active.renameTo(failed)
                    require(previous.renameTo(active)) { "rollback move failed" }
                    val revision = root.resolve("previous_revision").takeIf { it.isFile }?.readText()?.trim().orEmpty()
                    root.resolve("active_revision").writeText(revision)
                    root.resolve("previous_revision").writeText("")
                    failed.deleteRecursively()
                    result(id, name, true, JSONObject().put("rolledBack", true).put("activeRevision", revision))
                }
                "provider_health_check" -> {
                    result(id, name, false, null, "unsupported")
                }
            }
        } catch (_: Throwable) {
            result(id, name, false, null, "execution_failed")
        }
    }

    private fun applyRuntimeParameter(payload: JSONObject?): JSONObject {
        require(payload != null) { "runtime payload missing" }
        val key = payload.optString("key", "").trim()
        require(key.isNotBlank()) { "runtime parameter key is blank" }
        val raw = payload.opt("value")
        require(raw != null && raw != JSONObject.NULL) { "runtime parameter value is missing" }

        val value: Any = when {
            key == "model" -> {
                require(raw is String && raw.trim().isNotEmpty() && raw.length <= 256) { "invalid model" }
                raw.trim()
            }
            key == "timeoutMs" || key == "pollIntervalMs" -> {
                val number = raw as? Number ?: throw IllegalArgumentException("invalid $key")
                val normalized = number.toDouble()
                require(normalized.isFinite() && normalized >= 0.0 && normalized <= 300000.0) { "invalid $key" }
                normalized.toInt()
            }
            key == "syncEnabled" -> {
                require(raw is Boolean) { "invalid syncEnabled" }
                raw
            }
            key.startsWith("providerWeight.") -> {
                val provider = key.removePrefix("providerWeight.")
                require(provider.matches(Regex("[A-Za-z0-9_-]{1,64}"))) { "invalid provider weight" }
                val normalized = (raw as? Number)?.toDouble() ?: throw IllegalArgumentException("invalid provider weight")
                require(normalized.isFinite() && normalized >= 0.0 && normalized <= 100.0) { "invalid provider weight" }
                normalized
            }
            else -> throw IllegalArgumentException("unsupported runtime parameter")
        }

        LocalRuntimeConfig.setParameter(applicationContext, key, value)
        return JSONObject().put("key", key).put("value", value)
    }

    private fun result(id: String, command: String, ok: Boolean, value: JSONObject?, error: String? = null): Boolean {
        val body = JSONObject().apply {
            put("id", id)
            put("command", command)
            put("ok", ok)
            if (value != null) put("result", value)
            if (error != null) put("error", error)
        }.toString()
        val path = if (command == "set_runtime_parameter") RESULT_PATH else ACK_PATH
        repeat(ACK_ATTEMPTS) { attempt ->
            val response = runCatching { request("POST", path, body) }.getOrNull()
            if (response != null && response.code in 200..299) return true
            if (attempt + 1 < ACK_ATTEMPTS) {
                Thread.sleep(ACK_BASE_DELAY_MS shl attempt)
            }
        }
        return false
    }

    private fun request(method: String, path: String, body: String?): HttpResponse {
        val signed = signer.signCanonical(System.currentTimeMillis(), path)
        val connection = (URL(BASE_URL + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 30_000
            readTimeout = 30_000
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

    data class HttpResponse(val code: Int, val body: String)

    companion object {
        private const val BASE_URL = "https://andrew2-api.onrender.com"
        private const val COMMANDS_PATH = "/api/v1/bridge/v3/commands"
        private const val ACK_PATH = "/api/v1/bridge/v3/ack"
        private const val RESULT_PATH = "/api/v1/bridge/v3/result"
        private const val SYNC_WORK = "andrew-bridge-v3-sync"
        private const val COMMAND_WORK = "andrew-bridge-v3-commands"
        private const val ACK_ATTEMPTS = 4
        private const val ACK_BASE_DELAY_MS = 1_000L

        @JvmStatic
        fun enqueueNow(context: Context) {
            val request = OneTimeWorkRequest.Builder(AndrewBridgeCommandWorker::class.java).build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(COMMAND_WORK, ExistingWorkPolicy.REPLACE, request)
        }

        @JvmStatic
        fun schedule(context: Context) {
            val request = PeriodicWorkRequest.Builder(AndrewBridgeCommandWorker::class.java, 15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(COMMAND_WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
            enqueueNow(context)
        }
    }
}
