package com.andrew.app.bridge.v3

import android.content.Context
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

/** Explicit local trigger for Bridge V3 verification. */
object BridgeV3SelfTest {
    fun enqueue(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .enqueue(OneTimeWorkRequestBuilder<AndrewBridgeCommandWorker>().build())
    }
}
