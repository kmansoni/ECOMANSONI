package com.mansoni.navigator.voice

import android.content.Context
import android.content.Intent
import kotlinx.coroutines.*
import java.util.concurrent.LinkedBlockingQueue

class VoiceCommandQueue private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: VoiceCommandQueue? = null

        fun getInstance(context: Context): VoiceCommandQueue {
            return instance ?: synchronized(this) {
                instance ?: VoiceCommandQueue(context.applicationContext).also { instance = it }
            }
        }
    }

    private val commandQueue = LinkedBlockingQueue<String>()
    private var isSpeaking = false
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    fun start() {
        scope.launch {
            processQueue()
        }
    }

    fun stop() {
        scope.cancel()
    }

    fun speak(text: String) {
        commandQueue.offer(text)
    }

    private suspend fun processQueue() {
        while (isActive) {
            val command = commandQueue.poll()
            if (command != null) {
                speakCommand(command)
            }
            delay(100) // небольшая задержка между командами
        }
    }

    private fun speakCommand(text: String) {
        isSpeaking = true
        val intent = Intent(context, VoiceService::class.java).apply {
            action = VoiceService.ACTION_SPEAK
            putExtra(VoiceService.EXTRA_TEXT, text)
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }

        // Оценка длительности речи (примерно 15 символов в секунду)
        val durationMs = (text.length / 15) * 1000L
        scope.launch {
            delay(durationMs)
            isSpeaking = false
        }
    }
}
