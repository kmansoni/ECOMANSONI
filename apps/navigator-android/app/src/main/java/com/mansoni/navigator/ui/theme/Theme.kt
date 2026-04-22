package com.mansoni.navigator.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF1976D2),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFF03A9F4),
    tertiary = Color(0xFFFF5722),
    background = Color(0xFFF5F5F5),
    onBackground = Color(0xFF212121),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF212121),
    error = Color(0xFFD32F2F)
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF2196F3),
    onPrimary = Color(0xFF000000),
    secondary = Color(0xFF03A9F4),
    tertiary = Color(0xFFFF5722),
    background = Color(0xFF121212),
    onBackground = Color(0xFFE0E0E0),
    surface = Color(0xFF1E1E1E),
    onSurface = Color(0xFFE0E0E0),
    error = Color(0xFFD32F2F)
)

@Composable
fun NavigatorAppTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
