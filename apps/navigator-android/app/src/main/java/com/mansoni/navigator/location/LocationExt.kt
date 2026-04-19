package com.mansoni.navigator.location

import android.location.Location

fun Location.toRoutePoint(): RoutePoint {
    return RoutePoint(latitude, longitude)
}
