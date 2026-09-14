package com.andrew.app.bridge.v3

/** Server-authorized command classes accepted by the hot-update bridge. */
object BridgeCommandPolicy {
    val allowed = setOf(
        "sync_web_artifact",
        "rollback_web_artifact",
        "health_check",
        "provider_health_check",
        "open_settings",
        "request_status",
        "sync_now",
        "set_runtime_parameter"
    )

    fun requireAllowed(command: String) {
        require(command in allowed) { "bridge command not allowed: $command" }
    }
}
