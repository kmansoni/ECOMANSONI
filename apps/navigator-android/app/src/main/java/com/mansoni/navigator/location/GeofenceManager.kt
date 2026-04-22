package com.mansoni.navigator.location

import android.Manifest
import android.app.*
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

class GeofenceManager(private val context: Context) {

    private val geofencingClient: GeofencingClient by lazy {
        GeofencingClient(context)
    }

    private val pendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceReceiver::class.java)
        PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @SuppressLint("MissingPermission")
    fun addGeofence(
        requestId: String,
        latitude: Double,
        longitude: Double,
        radius: Float = 100f,
        expiration: Long = Geofence.NEVER_EXPIRE,
        transitionTypes: Int = Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT
    ) {
        if (ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val geofence = Geofence.Builder()
            .setRequestId(requestId)
            .setCircularRegion(latitude, longitude, radius)
            .setExpirationDuration(expiration)
            .setTransitionTypes(transitionTypes)
            .build()

        val geofenceRequest = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(geofence)
            .build()

        geofencingClient.addGeofences(geofenceRequest, pendingIntent).run {
            // Обработка результата
            addOnSuccessListener {
                // Геозона добавлена
            }
            addOnFailureListener {
                // Ошибка добавления
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun removeGeofence(requestId: String) {
        geofencingClient.removeGeofences(listOf(requestId))
    }

    fun clearAllGeofences() {
        geofencingClient.removeGeofences(pendingIntent)
    }
}

class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (GeofencingEvent.hasError(intent)) {
            val errorCode = GeofencingEvent.fromIntent(intent).errorCode
            return
        }

        val geofencingEvent = GeofencingEvent.fromIntent(intent)
        if (geofencingEvent.hasError()) return

        val transition = geofencingEvent.geofenceTransition

        val notificationManager = context.getSystemService(NotificationManager::class.java)

        when (transition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> {
                showNotification(
                    context,
                    "Добро пожаловать",
                    "Вы вошли в выбранный регион"
                )
            }
            Geofence.GEOFENCE_TRANSITION_EXIT -> {
                showNotification(
                    context,
                    "Выход из региона",
                    "Вы покинули выбранную зону"
                )
            }
        }
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "geofence_channel",
                "Геозоны",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Уведомления о геозонах"
            }
            val notificationManager = context.getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun showNotification(context: Context, title: String, text: String) {
        createNotificationChannel(context)

        val notification = NotificationCompat.Builder(context, "geofence_channel")
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .build()

        val notificationManager = context.getSystemService(NotificationManager::class.java)
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
