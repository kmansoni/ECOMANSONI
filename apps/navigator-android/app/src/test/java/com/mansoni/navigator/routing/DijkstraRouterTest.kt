package com.mansoni.navigator.routing

import com.mansoni.navigator.ui.screens.RoutePoint
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class DijkstraRouterTest {

    @Test
    fun `test route calculation returns non-empty list`() = runBlocking {
        val router = DijkstraRouter()
        val start = RoutePoint(55.751244, 37.618423)
        val end = RoutePoint(55.763172, 37.61978)

        val routes = router.calculateRoutes(start, end)

        assertTrue("Routes list should not be empty", routes.isNotEmpty())
        assertEquals("Москва", routes[0].name)
    }

    @Test
    fun `test haversine distance is accurate`() {
        val router = DijkstraRouter()
        // Distance between Moscow Kremlin and Red Square ~0.8km
        val dist = router::class.java.getDeclaredMethod("haversine", Double::class.java, Double::class.java, Double::class.java, Double::class.java)
            .invoke(router, 55.752023, 37.617499, 55.7539, 37.6208) as Double
        assertTrue(dist < 1.0) // <1 km
    }
}
