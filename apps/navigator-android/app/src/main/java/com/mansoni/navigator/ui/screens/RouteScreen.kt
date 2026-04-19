package com.mansoni.navigator.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavController
import com.mansoni.navigator.location.LocationManager
import com.mansoni.navigator.offline.LocalDataRepository
import com.mansoni.navigator.routing.LocalRoutingClient
import com.mansoni.navigator.routing.RouteData
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteScreen(
    navController: NavController
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var startPoint by remember { mutableStateOf<RoutePoint?>(null) }
    var endPoint by remember { mutableStateOf<RoutePoint?>(null) }
    var availableRoutes by remember { mutableStateOf<List<RouteData>>(emptyList()) }
    var selectedRoute by remember { mutableStateOf<RouteData?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    // Получаем точку назначения из предыдущего экрана
    LaunchedEffect(Unit) {
        val savedState = navController.currentBackStackEntry?.savedStateHandle
        val destination = savedState?.get<SearchResult>("selectedLocation")
        if (destination != null) {
            endPoint = RoutePoint(destination.lat, destination.lon)
        }

        // Текущая позиция пользователя
        startPoint = getCurrentLocation(context)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Маршрут") }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Поле ввода начальной точки
            OutlinedTextField(
                value = startPoint?.let { "Текущее местоположение" } ?: "",
                onValueChange = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                label = { Text("Откуда") },
                readOnly = true,
                trailingIcon = {
                    if (startPoint == null) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    }
                }
            )

            // Поле ввода конечной точки
            OutlinedTextField(
                value = endPoint?.let { "Выбрано на карте" } ?: "",
                onValueChange = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                label = { Text("Куда") },
                readOnly = true,
                trailingIcon = {
                    IconButton(onClick = {
                        navController.navigate("search")
                    }) {
                        Icon(
                            imageVector = androidx.compose.material.icons.Icons.Default.Search,
                            contentDescription = "Выбрать"
                        )
                    }
                }
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Кнопка построения маршрута
            Button(
                onClick = {
                    if (startPoint != null && endPoint != null) {
                        isLoading = true
                        scope.launch {
                            val routes = buildRoutes(startPoint!!, endPoint!!, context)
                            availableRoutes = routes
                            isLoading = false

                            if (routes.isNotEmpty()) {
                                selectedRoute = routes.first()
                            }
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                enabled = startPoint != null && endPoint != null && !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Построить маршрут")
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Список построенных маршрутов
            if (availableRoutes.isNotEmpty()) {
                Text(
                    text = "Варианты маршрутов:",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                LazyColumn(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(availableRoutes) { route ->
                        RouteCard(
                            route = route,
                            isSelected = selectedRoute == route,
                            onClick = { selectedRoute = route },
                            onNavigate = {
                                // Передать маршрут в NavigateScreen
                                navController.previousBackStackEntry?.savedStateHandle?.set(
                                    "route",
                                    route
                                )
                                navController.navigate("navigate")
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RouteCard(
    route: RouteData,
    isSelected: Boolean,
    onClick: () -> Unit,
    onNavigate: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        onClick = onClick,
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = route.name ?: "Маршрут",
                    style = MaterialTheme.typography.titleMedium
                )
                if (isSelected) {
                    Icon(
                        imageVector = androidx.compose.material.icons.Icons.Default.Check,
                        contentDescription = "Выбрано",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
            Text(
                text = "Расстояние: ${route.distance}",
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                text = "Время: ${route.duration}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onNavigate,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Начать навигацию")
            }
        }
    }
}

private suspend fun buildRoutes(
    start: RoutePoint,
    end: RoutePoint,
    context: android.content.Context
): List<RouteData> {
    return try {
        val client = LocalRoutingClient(context)
        client.calculateRoutes(start, end)
    } catch (e: Exception) {
        emptyList()
    }
}

private suspend fun getCurrentLocation(context: android.content.Context): RoutePoint? {
    return try {
        val locationManager = LocationManager(context)
        val location = locationManager.getCurrentLocation()
        if (location != null) {
            RoutePoint(location.latitude, location.longitude)
        } else null
    } catch (e: Exception) {
        null
    }
}
