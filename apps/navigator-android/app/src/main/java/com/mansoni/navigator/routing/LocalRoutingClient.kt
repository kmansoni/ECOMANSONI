package com.mansoni.navigator.routing

import android.content.Context
import com.mansoni.navigator.ui.screens.RouteData
import com.mansoni.navigator.ui.screens.RouteDestination
import com.mansoni.navigator.ui.screens.RoutePoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.serialization.*
import kotlinx.serialization.json.*

class LocalRoutingClient(private val context: Context) {

    private val localApiBase = "http://10.0.2.2:8080" // localhost emulator
    // Для физического устройства: http://<IP_PC>:8080
    private val embeddedRouter = DijkstraRouter()

    suspend fun calculateRoutes(
        start: RoutePoint,
        end: RoutePoint
    ): List<RouteData> = withContext(Dispatchers.IO) {
        try {
            // Сначала пробуем локальный сервер
            getRoutesFromLocalServer(start, end)
        } catch (e: Exception) {
            // Если сервер недоступен, используем встроенный алгоритм
            embeddedRouter.calculateRoutes(start, end)
        }
    }

    private suspend fun getRoutesFromLocalServer(
        start: RoutePoint,
        end: RoutePoint
    ): List<RouteData> {
        val url = URL("$localApiBase/route?from=${start.lat},${start.lon}&to=${end.lat},${end.lon}")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 5000
        connection.readTimeout = 5000

        return if (connection.responseCode == 200) {
            val response = connection.inputStream.bufferedReader().readText()
            parseRoutesJson(response)
        } else {
            emptyList()
        }
    }

    @OptIn(ExperimentalSerializationApi::class)
    private fun parseRoutesJson(json: String): List<RouteData> {
        val jsonObj = Json.parseToJsonElement(json).jsonObject
        val routesArray = jsonObj["routes"]?.jsonArray ?: return emptyList()

        return routesArray.map { routeElem ->
            val route = routeElem.jsonObject
            RouteData(
                name = route["name"]?.jsonPrimitive?.content,
                distance = route["distance"]?.jsonPrimitive?.content ?: "0 км",
                duration = route["duration"]?.jsonPrimitive?.content ?: "0 мин",
                destination = RouteDestination(
                    name = route["destination"]?.jsonObject?.get("name")?.jsonPrimitive?.content ?: "",
                    lat = route["destination"]?.jsonObject?.get("lat")?.jsonPrimitive?.double ?: 0.0,
                    lon = route["destination"]?.jsonObject?.get("lon")?.jsonPrimitive?.double ?: 0.0
                ),
                points = emptyList() // Заполняетсяlater
            )
        }
    }
}
