package com.andrew.app.bridge.v3

import android.content.Context
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
        when (name) {
            "sync_now" -> {
                val request = OneTimeWorkRequest.Builder(AndrewSyncWorker::class.java).build()
                WorkManager.getInstance(applicationContext).enqueueUniqueWork(SYNC_WORK, ExistingWorkPolicy.REPLACE, request)
                ack(id, true, JSONObject().put("scheduled", true))
            }
            "set_runtime_parameter" -> {
                val payload = command.optJSONObject("payload") ?: JSONObject()
                ack(id, true, payload)
            }
            "request_status" -> {
                val root = applicationContext.filesDir.resolve("andrew_web_sandbox")
                val revision = root.resolve("active_revision").takeIf { it.isFile }?.readText()?.trim().orEmpty()
                ack(id, true, JSONObject().put("activeRevision", revision).put("sandboxActive", root.resolve("active").isDirectory))
            }
            "open_settings" -> ack(id, true, JSONObject().put("accepted", true))
            else -> ack(id, false, null, "unsupported")
        }
    }

    private fun ack(id: String, ok: Boolean, result: JSONObject?, error: String? = null) {
        val body = JSONObject().apply {
            put("id", id)
            put("ok", ok)
            if (result != null) put("result", result)
            if (error != null) put("error", error)
        }.toString()
        request("POST", ACK_PATH, body)
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
        private const val SYNC_WORK = "andrew-bridge-v3-sync"
        private const val COMMAND_WORK = "andrew-bridge-v3-commands"

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
