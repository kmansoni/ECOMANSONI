package com.mansoni.navigator.util

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

object Prefs {
    private const val PREFS_NAME = "navigator_prefs"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    var isFirstLaunch: Boolean
        get() = prefs.getBoolean("first_launch", true)
        set(value) = prefs.edit { putBoolean("first_launch", value) }

    var voiceEnabled: Boolean
        get() = prefs.getBoolean("voice_enabled", true)
        set(value) = prefs.edit { putBoolean("voice_enabled", value) }

    var vibrationEnabled: Boolean
        get() = prefs.getBoolean("vibration_enabled", false)
        set(value) = prefs.edit { putBoolean("vibration_enabled", value) }

    var distanceUnit: String
        get() = prefs.getString("distance_unit", "km") ?: "km"
        set(value) = prefs.edit { putString("distance_unit", value) }

    var selectedRegion: String?
        get() = prefs.getString("selected_region", null)
        set(value) = prefs.edit { putString("selected_region", value) }
}
