package com.mansoni.navigator.ui.components

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.mansoni.navigator.location.LocationManager
import java.util.concurrent.Executor
import java.util.concurrent.Executors

@Composable
fun MapView(
    modifier: Modifier = Modifier,
    showUserLocation: Boolean = false
) {
    val context = LocalContext.current

    var webView by remember { mutableStateOf<WebView?>(null) }
    var userLocation by remember { mutableStateOf<Pair<Double, Double>?>(null) }

    // Точка по умолчанию
    val defaultLocation = remember { Pair(55.751244, 37.618423) } // Москва

    DisposableEffect(Unit) {
        val executor: Executor = Executors.newSingleThreadExecutor()
        val handler = Handler(Looper.getMainLooper())

        // Запускаем получение геопозиции в фоне
        if (showUserLocation) {
            executor.execute {
                val locationManager = LocationManager(context)
                val location = locationManager.getCurrentLocation()
                handler.post {
                    userLocation = location?.let { Pair(it.latitude, it.longitude) }
                }
            }
        }

        onDispose { }
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                // Оффлайн-тайлы: используем локальный файл или оставляем пустым
                loadUrl("file:///android_asset/offline_map.html")
            }.also { webView = it }
        },
        modifier = modifier,
        update = { view ->
            val (lat, lon) = userLocation ?: defaultLocation
            val js = """
                (function() {
                    if (typeof setUserLocation === 'function') {
                        setUserLocation($lat, $lon);
                    }
                    if (typeof addMarker === 'function') {
                        addMarker($lat, $lon, 'Вы здесь');
                    }
                })();
            """.trimIndent()
            view.evaluateJavascript(js, null)
        }
    )
}
