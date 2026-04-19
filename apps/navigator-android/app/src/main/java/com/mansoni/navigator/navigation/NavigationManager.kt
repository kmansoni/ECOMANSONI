package com.mansoni.navigator.navigation

import android.app.Service
import android.content.Intent
import android.location.Location
import android.os.IBinder
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.mansoni.navigator.location.LocationManager
import com.mansoni.navigator.routing.LocalRoutingClient
import com.mansoni.navigator.routing.RouteData
import com.mansoni.navigator.routing.RoutePoint
import com.mansoni.navigator.ui.screens.NavigationInfo
import com.mansoni.navigator.voice.VoiceService
import kotlinx.coroutines.*
import kotlin.math.*

class NavigationManager : LifecycleService() {

    private lateinit var locationManager: LocationManager
    private var currentRoute: RouteData? = null
    private var currentPositionIndex = 0
    private val voiceQueue = VoiceCommandQueue()

    companion object {
        private const val UPDATE_INTERVAL = 1000L // 1 секунда
        private const val DISTANCE_THRESHOLD = 20.0 // метров до следующей точки
    }

    override fun onCreate() {
        super.onCreate()
        locationManager = LocationManager(this)
        voiceQueue.start()
    }

    fun startNavigation(route: RouteData) {
        currentRoute = route
        currentPositionIndex = 0

        lifecycleScope.launch {
            locationManager.locationUpdates(UPDATE_INTERVAL).collect { location ->
                updateNavigation(location)
            }
        }
    }

    fun stopNavigation() {
        currentRoute = null
        voiceQueue.stop()
    }

    private fun updateNavigation(currentLocation: Location) {
        val route = currentRoute ?: return

        // Находим ближайшую точку на маршруте
        val closestIndex = findClosestPointIndex(currentLocation, route.points)

        if (closestIndex > currentPositionIndex) {
            currentPositionIndex = closestIndex
            announceNextInstruction(route, currentLocation)
        }

        // Проверяем близость к точке поворота
        val nextPoint = route.points.getOrNull(currentPositionIndex + 1)
        if (nextPoint != null) {
            val distance = haversine(
                currentLocation.latitude, currentLocation.longitude,
                nextPoint.lat, nextPoint.lon
            )

            if (distance < DISTANCE_THRESHOLD / 1000) {
                // Говорим инструкцию
                voiceQueue.speak("Следуйте по маршруту")

                currentPositionIndex++
            }
        }
    }

    private fun findClosestPointIndex(location: Location, points: List<RoutePoint>): Int {
        var minDist = Double.MAX_VALUE
        var closestIndex = 0

        points.forEachIndexed { index, point ->
            val dist = haversine(
                location.latitude, location.longitude,
                point.lat, point.lon
            )
            if (dist < minDist) {
                minDist = dist
                closestIndex = index
            }
        }

        return closestIndex
    }

    private fun announceNextInstruction(route: RouteData, location: Location) {
        val instruction = getInstructionForSegment(currentPositionIndex)
        voiceQueue.speak(instruction)
    }

    private fun getInstructionForSegment(index: Int): String {
        // Простая логика инструкций
        return when (index % 4) {
            0 -> "Продолжайте движение прямо"
            1 -> "Через 200 метров поверните направо"
            2 -> "Через 500 метров поверните налево"
            3 -> "Приближаетесь к пункту назначения"
            else -> "Продолжайте движение"
        }
    }

    fun getCurrentNavigationInfo(start: RoutePoint, end: RoutePoint): NavigationInfo {
        val currentRoute = this.currentRoute ?: return NavigationInfo(
            distanceRemaining = "0 м",
            timeRemaining = "0 мин",
            nextInstruction = "Маршрут не выбран",
            currentStreet = ""
        )

        val distance = calculateDistanceRemaining(start)
        val time = calculateTimeRemaining(distance)

        return NavigationInfo(
            distanceRemaining = "${distance.toInt()} м",
            timeRemaining = "${time} мин",
            nextInstruction = getInstructionForSegment(currentPositionIndex),
            currentStreet = "ул. Новая"
        )
    }

    private fun calculateDistanceRemaining(currentLocation: RoutePoint): Double {
        val route = currentRoute ?: return 0.0
        var totalDistance = 0.0

        for (i in currentPositionIndex until route.points.size - 1) {
            val p1 = route.points[i]
            val p2 = route.points[i + 1]
            totalDistance += haversine(p1.lat, p1.lon, p2.lat, p2.lon)
        }

        return totalDistance * 1000
    }

    private fun calculateTimeRemaining(distanceMeters: Double): Int {
        // Средняя скорость 50 км/ч
        val speedKmH = 50.0
        val hours = distanceMeters / 1000 / speedKmH
        return (hours * 60).toInt()
    }

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat/2).pow(2.0) + cos(Math.toRadians(lat1)) *
                cos(Math.toRadians(lat2)) * sin(dLon/2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1-a))
        return R * c
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
