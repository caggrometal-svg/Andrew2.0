package com.andrew.app.bridge.v3

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager

object AndrewSyncBridge {
    private const val SYNC_WORK = "andrew-bridge-v3-sync"

    fun dispatch(context: Context, command: String): Boolean {
        if (command != "sync_now") return false
        val request = OneTimeWorkRequest.Builder(AndrewSyncWorker::class.java).build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(SYNC_WORK, ExistingWorkPolicy.REPLACE, request)
        return true
    }
}
