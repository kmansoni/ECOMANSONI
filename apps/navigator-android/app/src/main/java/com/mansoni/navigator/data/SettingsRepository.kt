package com.mansoni.navigator.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {

    companion object {
        val VOICE_ENABLED = booleanPreferencesKey("voice_enabled")
        val VIBRATION_ENABLED = booleanPreferencesKey("vibration_enabled")
        val DISTANCE_UNIT = stringPreferencesKey("distance_unit")
        val SELECTED_REGION = stringPreferencesKey("selected_region")
    }

    val voiceEnabledFlow = context.dataStore.data.map { it[VOICE_ENABLED] ?: true }
    val vibrationEnabledFlow = context.dataStore.data.map { it[VIBRATION_ENABLED] ?: false }
    val distanceUnitFlow = context.dataStore.data.map { it[DISTANCE_UNIT] ?: "km" }

    suspend fun setVoiceEnabled(enabled: Boolean) {
        context.dataStore.edit { it[VOICE_ENABLED] = enabled }
    }

    suspend fun setVibrationEnabled(enabled: Boolean) {
        context.dataStore.edit { it[VIBRATION_ENABLED] = enabled }
    }

    suspend fun setDistanceUnit(unit: String) {
        context.dataStore.edit { it[DISTANCE_UNIT] = unit }
    }

    suspend fun setSelectedRegion(regionId: String) {
        context.dataStore.edit { it[SELECTED_REGION] = regionId }
    }
}
