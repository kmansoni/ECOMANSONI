package com.mansoni.navigator.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavController
import com.mansoni.navigator.offline.RegionDownloadManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    navController: NavController
) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Настройки") }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Скачивание регионов
            item {
                SettingsSection(title = "Офлайн карты") {
                    RegionDownloadSettings(context = context)
                }
            }

            item {
                SettingsSection(title = "Голосовые подсказки") {
                    SettingSwitch(
                        title = "Включён",
                        subtitle = "Голосовые команды при навигации",
                        initialValue = true
                    ) { enabled ->
                        // TODO: Отключить TTS
                    }
                    Divider()
                    SettingSwitch(
                        title = "Вибро-отклик",
                        subtitle = "Тактильная обратная связь",
                        initialValue = false
                    ) { enabled ->
                        // TODO: Включить вибрацию
                    }
                }
            }

            item {
                SettingsSection(title = "Приложение") {
                    SettingItem(
                        title = "О приложении",
                        subtitle = "Версия 1.0"
                    ) {
                        // TODO: Показать диалог с версией
                    }
                }
            }
        }
    }
}

@Composable
private fun RegionDownloadSettings(
    context: Context
) {
    var downloadProgress by remember { mutableStateOf(0) }
    var isDownloading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Text(
            text = "Скачанные регионы",
            style = MaterialTheme.typography.titleSmall
        )
        Spacer(modifier = Modifier.height(8.dp))

        // Список доступных регионов
        RegionListItem(
            regionName = "Москва и область",
            size = "1.2 ГБ",
            isDownloaded = true
        )
        RegionListItem(
            regionName = "Санкт-Петербург",
            size = "850 МБ",
            isDownloaded = false,
            progress = downloadProgress.takeIf { isDownloading } ?: 0,
            onClick = {
                if (!isDownloading) {
                    isDownloading = true
                    downloadProgress = 0
                    val manager = RegionDownloadManager(context)
                    manager.downloadRegion(
                        "spb",
                        "https://example.com/regions/spb.mbtiles"
                    ) { progress ->
                        downloadProgress = progress.toInt()
                        if (progress >= 100) {
                            isDownloading = false
                        }
                    }
                }
            }
        )
    }
}

@Composable
private fun RegionListItem(
    regionName: String,
    size: String,
    isDownloaded: Boolean,
    progress: Int = 0,
    onClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = regionName,
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    text = size,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (!isDownloaded && progress > 0 && progress < 100) {
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { progress / 100f },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = "$progress%",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            if (isDownloaded) {
                Icon(
                    imageVector = androidx.compose.material.icons.Icons.Default.CheckCircle,
                    contentDescription = "Скачан",
                    tint = MaterialTheme.colorScheme.primary
                )
            } else if (progress >= 100) {
                Icon(
                    imageVector = androidx.compose.material.icons.Icons.Default.CheckCircle,
                    contentDescription = "Готово",
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun SettingItem(
    title: String,
    subtitle: String? = null,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        onClick = onClick
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun SettingSwitch(
    title: String,
    subtitle: String? = null,
    initialValue: Boolean,
    onValueChange: (Boolean) -> Unit
) {
    var checked by remember { mutableStateOf(initialValue) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Switch(
                checked = checked,
                onCheckedChange = { newValue ->
                    checked = newValue
                    onValueChange(newValue)
                }
            )
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit
) {
    Column {
        Text(
            text = title,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium
        )
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
        ) {
            content()
        }
    }
}
