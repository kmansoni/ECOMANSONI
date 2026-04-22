package com.mansoni.navigator.di

import android.content.Context
import com.mansoni.navigator.location.BackgroundLocationService
import com.mansoni.navigator.location.GeofenceManager
import com.mansoni.navigator.location.LocationManager
import com.mansoni.navigator.navigation.NavigationManager
import com.mansoni.navigator.offline.LocalDataRepository
import com.mansoni.navigator.offline.RegionDownloadManager
import com.mansoni.navigator.routing.LocalRoutingClient
import com.mansoni.navigator.voice.VoiceService

object ServiceLocator {
    private var locationManager: LocationManager? = null
    private var geofenceManager: GeofenceManager? = null
    private var localRoutingClient: LocalRoutingClient? = null
    private var regionDownloadManager: RegionDownloadManager? = null
    private var localDataRepository: LocalDataRepository? = null
    private var voiceService: VoiceService? = null
    private var navigationManager: NavigationManager? = null

    fun init(context: Context) {
        locationManager = LocationManager(context)
        geofenceManager = GeofenceManager(context)
        localRoutingClient = LocalRoutingClient(context)
        regionDownloadManager = RegionDownloadManager(context)
        localDataRepository = LocalDataRepository.getInstance(context)
        voiceService = VoiceService()
        navigationManager = NavigationManager()
    }

    fun getLocationManager(): LocationManager = locationManager ?: throw IllegalStateException("Not initialized")
    fun getGeofenceManager(): GeofenceManager = geofenceManager ?: throw IllegalStateException("Not initialized")
    fun getRoutingClient(): LocalRoutingClient = localRoutingClient ?: throw IllegalStateException("Not initialized")
    fun getRegionDownloadManager(): RegionDownloadManager = regionDownloadManager ?: throw IllegalStateException("Not initialized")
    fun getLocalDataRepository(): LocalDataRepository = localDataRepository ?: throw IllegalStateException("Not initialized")
    fun getVoiceService(): VoiceService = voiceService ?: throw IllegalStateException("Not initialized")
    fun getNavigationManager(): NavigationManager = navigationManager ?: throw IllegalStateException("Not initialized")
}
