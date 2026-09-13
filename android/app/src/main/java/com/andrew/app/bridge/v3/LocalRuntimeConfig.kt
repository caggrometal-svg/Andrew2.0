package com.andrew.app.bridge.v3

import android.content.Context

object LocalRuntimeConfig {
    private const val PREFS = "andrew_bridge_v3_runtime"

    fun setParameter(context: Context, key: String, value: Any?) {
        require(key.isNotBlank()) { "runtime parameter key is blank" }
        val editor = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        when (value) {
            null -> editor.remove(key)
            is Boolean -> editor.putBoolean(key, value)
            is Int -> editor.putInt(key, value)
            is Long -> editor.putLong(key, value)
            is Float -> editor.putFloat(key, value)
            is Double -> editor.putString(key, value.toString())
            else -> editor.putString(key, value.toString())
        }
        check(editor.commit()) { "failed to persist runtime parameter" }
    }
}
