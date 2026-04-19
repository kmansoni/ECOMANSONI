package com.mansoni.navigator.voice

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.speech.tts.TextToSpeech
import androidx.lifecycle.LifecycleService
import kotlinx.coroutines.*
import java.util.*

class VoiceService : LifecycleService(), TextToSpeech.OnInitListener {

    private var textToSpeech: TextToSpeech? = null
    private var isTtsReady = false
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    companion object {
        private const val ACTION_SPEAK = "com.mansoni.navigator.ACTION_SPEAK"
        private const val EXTRA_TEXT = "extra_text"
    }

    override fun onCreate() {
        super.onCreate()
        textToSpeech = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            textToSpeech?.language = Locale("ru", "RU")
            isTtsReady = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.action?.let { action ->
            if (action == ACTION_SPEAK) {
                val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
                speak(text)
            }
        }
        return START_NOT_STICKY
    }

    fun speak(text: String) {
        if (!isTtsReady) return

        scope.launch {
            textToSpeech?.speak(text, TextToSpeech.QUEUE_ADD, null, null)
        }
    }

    fun stopSpeaking() {
        textToSpeech?.stop()
    }

    override fun onDestroy() {
        scope.cancel()
        textToSpeech?.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
