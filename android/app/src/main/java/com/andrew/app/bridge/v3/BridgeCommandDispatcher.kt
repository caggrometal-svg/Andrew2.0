package com.andrew.app.bridge.v3

import android.content.Context
import android.util.Log

object BridgeCommandDispatcher {
  private const val TAG = "BridgeCommandDispatcher"

  fun dispatch(context: Context, command: String, payload: Map<String, Any?>?): Boolean {
    return try {
      when (command) {
        "sync_now" -> {
          AndrewSyncBridge.dispatch(context, command)
          true
        }
        "set_runtime_parameter" -> {
          if (payload != null) {
            val key = payload["key"] as? String
            val value = payload["value"]
            if (key != null) {
              LocalRuntimeConfig.setParameter(context, key, value)
              Log.d(TAG, "Runtime parameter set: $key = $value")
              true
            } else {
              Log.w(TAG, "Missing key in set_runtime_parameter payload")
              false
            }
          } else {
            Log.w(TAG, "No payload for set_runtime_parameter")
            false
          }
        }
        "open_settings" -> true
        "request_status" -> true
        else -> {
          Log.w(TAG, "Unknown command: $command")
          false
        }
      }
    } catch (error: Exception) {
      Log.e(TAG, "Command dispatch failed for $command: ${error.message}", error)
      false
    }
  }
}
