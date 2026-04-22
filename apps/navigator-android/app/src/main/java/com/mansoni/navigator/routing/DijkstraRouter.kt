package com.mansoni.navigator.routing

import android.content.Context
import com.mansoni.navigator.offline.LocalDataRepository
import com.mansoni.navigator.ui.screens.RouteData
import com.mansoni.navigator.ui.screens.RoutePoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.*

class DijkstraRouter {

    private val dataRepository = LocalDataRepository()

    suspend fun calculateRoutes(
        start: RoutePoint,
        end: RoutePoint
    ): List<RouteData> = withContext(Dispatchers.Default) {
        // Для офлайн-режима используем упрощённый алгоритм
        // В реальном приложении здесь будет загрузка графа дорог из .pbf/.obf файла
        // или через osmnx

        val directDistance = haversine(start.lat, start.lon, end.lat, end.lon)
        val estimatedTime = (directDistance / 50 * 60).toInt() // 50 км/ч средняя скорость

        val route = RouteData(
            name = "Прямой маршрут (офлайн)",
            distance = "${(directDistance * 1000).toInt()} м",
            duration = "${estimatedTime} мин",
            destination = null,
            points = listOf(start, end)
        )

        listOf(route)
    }

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371 // Earth radius in km
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2.0) +
                cos(Math.toRadians(lat1)) *
                cos(Math.toRadians(lat2)) *
                sin(dLon / 2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    }
}
