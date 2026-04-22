package com.mansoni.navigator.offline

import android.content.Context
import android.content.SharedPreferences
import com.mansoni.navigator.ui.screens.SearchResult
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class LocalDataRepository private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: LocalDataRepository? = null

        fun getInstance(context: Context): LocalDataRepository {
            return instance ?: synchronized(this) {
                instance ?: LocalDataRepository(context.applicationContext).also { instance = it }
            }
        }
    }

    private val prefs: SharedPreferences = context.getSharedPreferences("navigator_offline", Context.MODE_PRIVATE)

    private val samplePOI = listOf(
        SearchResult("Красная площадь", "Москва, Россия", 55.7539, 37.6208),
        SearchResult("Эрмитаж", "Санкт-Петербург, Россия", 59.9398, 30.3146),
        SearchResult("Николаевский собор", "Нижний Новгород", 56.3235, 44.0066),
        SearchResult("Казанский кремль", "Казань, Россия", 55.8304, 49.0661),
        SearchResult("Плотина ГЭС", "Саяно-Шушенское водохранилище", 52.8316, 91.3895)
    )

    suspend fun getPOI(): List<SearchResult> = samplePOI

    suspend fun getNearbyPOIs(lat: Double, lon: Double, radiusKm: Double): List<SearchResult> {
        return samplePOI.filter { poi ->
            val dx = haversine(lat, lon, poi.lat, poi.lon)
            dx <= radiusKm
        }
    }

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat/2).pow(2.0) +
                cos(Math.toRadians(lat1)) *
                cos(Math.toRadians(lat2)) *
                sin(dLon/2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1-a))
        return R * c
    }

    fun saveFavorite(poi: SearchResult) {
        val favoritesJson = prefs.getString("favorites", null)
        val favorites = if (favoritesJson != null) {
            Json.decodeFromString<List<SearchResult>>(favoritesJson)
        } else emptyList()
        val updated = favorites + poi
        prefs.edit().putString("favorites", Json.encodeToString(updated)).apply()
    }

    fun getFavorites(): List<SearchResult> {
        val favoritesJson = prefs.getString("favorites", null)
        return if (favoritesJson != null) {
            Json.decodeFromString(favoritesJson)
        } else emptyList()
    }
}
