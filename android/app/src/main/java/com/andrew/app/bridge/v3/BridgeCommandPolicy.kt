package com.andrew.app.bridge.v3

/** Server-authorized command classes accepted by the hot-update bridge. */
object BridgeCommandPolicy {
    val allowed = setOf(
        "set_runtime_parameter",
        "sync_web_artifact",
        "rollback_web_artifact",
        "health_check",
        "provider_health_check"
    )

    fun requireAllowed(command: String) {
        require(command in allowed) { "bridge command not allowed: $command" }
    }
}
