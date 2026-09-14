package com.andrew.app.bridge.v3

/** Canonical six-provider order mirrored from the Render router. */
object ProviderRouterSpec {
    const val policy = "balanced"
    val order = listOf("openai", "openrouter", "gemini", "anthropic", "deepseek", "xai")
    const val maxAttempts = 2
    const val timeoutMs = 60000
}
