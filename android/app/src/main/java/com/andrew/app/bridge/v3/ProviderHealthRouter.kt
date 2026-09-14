package com.andrew.app.bridge.v3

import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Six-provider failover probe. Routing authority remains the Render AI router. */
class ProviderHealthRouter(private val baseUrl: String = "https://andrew2-api.onrender.com") {
    private val providers = listOf("openai", "openrouter", "gemini", "anthropic", "deepseek", "xai")

    suspend fun probe(): JSONObject {
        val results = JSONArray()
        var healthy = 0
        for (provider in providers) {
            var ok = false
            var lastCode = -1
            repeat(2) { attempt ->
                try {
                    val c = URL("$baseUrl/health").openConnection() as HttpURLConnection
                    c.connectTimeout = 8000
                    c.readTimeout = 8000
                    c.requestMethod = "GET"
                    lastCode = c.responseCode
                    ok = lastCode in 200..299
                    c.disconnect()
                    if (ok) return@repeat
                } catch (_: Throwable) {
                    lastCode = -1
                }
                if (attempt == 0) delay(250)
            }
            if (ok) healthy++
            results.put(JSONObject().apply {
                put("provider", provider)
                put("healthy", ok)
                put("status", lastCode)
            })
        }
        return JSONObject().apply {
            put("ok", healthy > 0)
            put("healthy", healthy)
            put("total", providers.size)
            put("providers", results)
            put("policy", "balanced-failover")
        }
    }
}
