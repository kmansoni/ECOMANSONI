package com.mansoni.navigator.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import com.mansoni.navigator.location.LocationManager
import com.mansoni.navigator.navigation.NavigationManager
import com.mansoni.navigator.routing.LocalRoutingClient
import com.mansoni.navigator.ui.components.NavigationPanel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavigateScreen(
    navController: NavController
) {
    val context = LocalContext.current
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    var navigationInfo by remember {
        mutableStateOf<NavigationInfo?>(null)
    }

    var isNavigating by remember { mutableStateOf(false) }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    // Получаем сохранённый маршрут из аргументов
    val route = navController.currentBackStackEntry?.arguments?.getParcelable<RouteData>("route")

    LaunchedEffect(route) {
        route?.let {
            if (it.destination != null) {
                isNavigating = true
                // TODO: Инициализировать NavigationManager для turn-by-turn
                navigationInfo = NavigationInfo(
                    distanceRemaining = it.distance,
                    timeRemaining = it.duration,
                    nextInstruction = "Следуйте по маршруту",
                    currentStreet = "Ул. Навигационная"
                )
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Навигация") },
                actions = {
                    if (isNavigating) {
                        IconButton(onClick = {
                            isNavigating = false
                            navigationInfo = null
                            navController.popBackStack()
                        }) {
                            Icon(
                                imageVector = androidx.compose.material.icons.Icons.Default.Close,
                                contentDescription = "Завершить"
                            )
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                route == null -> {
                    // Нет выбранного маршрута
                    EmptyState(
                        message = "Выберите маршрут",
                        buttonText = "Построить маршрут",
                        onClick = { navController.navigate("route") }
                    )
                }

                !hasLocationPermission -> {
                    PermissionRequest(
                        onRequestPermission = {
                            locationPermissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        }
                    )
                }

                isNavigating -> {
                    NavigationContent(
                        navigationInfo = navigationInfo,
                        modifier = Modifier.weight(1f)
                    )

                    NavigationPanel(
                        modifier = Modifier.padding(16.dp),
                        onInstructionTap = {
                            // Показать детальную инструкцию
                        }
                    ) {
                        // Ничего
                    }
                }
            }
        }
    }
}

@Composable
private fun NavigationContent(
    navigationInfo: NavigationInfo?,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (navigationInfo != null) {
            Text(
                text = "Осталось",
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = navigationInfo.distanceRemaining,
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = navigationInfo.timeRemaining,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = navigationInfo.nextInstruction,
                style = MaterialTheme.typography.headlineSmall
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = navigationInfo.currentStreet,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun PermissionRequest(
    onRequestPermission: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Требуется доступ к местоположению",
            style = MaterialTheme.typography.titleLarge
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Для работы навигации необходимо предоставить разрешение на доступ к GPS",
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onRequestPermission) {
            Text("Предоставить доступ")
        }
    }
}

@Composable
private fun EmptyState(
    message: String,
    buttonText: String,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.titleLarge
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onClick) {
            Text(buttonText)
        }
    }
}

data class NavigationInfo(
    val distanceRemaining: String,
    val timeRemaining: String,
    val nextInstruction: String,
    val currentStreet: String
)

data class RouteData(
    val destination: RouteDestination?,
    val distance: String,
    val duration: String,
    val points: List<RoutePoint>
) : android.os.Parcelable {
    constructor(parcel: android.os.Parcel) : this(
        destination = parcel.readParcelable(RouteDestination::class.java.classLoader),
        distance = parcel.readString() ?: "",
        duration = parcel.readString() ?: "",
        points = mutableListOf<RoutePoint>().apply {
            parcel.readList(this, RoutePoint::class.java.classLoader)
        }
    )

    override fun writeToParcel(parcel: android.os.Parcel, flags: Int) {
        parcel.writeParcelable(destination, flags)
        parcel.writeString(distance)
        parcel.writeString(duration)
        parcel.writeList(points)
    }

    override fun describeContents(): Int = 0

    companion object CREATOR : android.os.Parcelable.Creator<RouteData> {
        override fun createFromParcel(parcel: android.os.Parcel): RouteData = RouteData(parcel)
        override fun newArray(size: Int): Array<RouteData?> = arrayOfNulls(size)
    }
}

data class RouteDestination(
    val name: String,
    val lat: Double,
    val lon: Double
) : android.os.Parcelable {
    constructor(parcel: android.os.Parcel) : this(
        name = parcel.readString() ?: "",
        lat = parcel.readDouble(),
        lon = parcel.readDouble()
    )

    override fun writeToParcel(parcel: android.os.Parcel, flags: Int) {
        parcel.writeString(name)
        parcel.writeDouble(lat)
        parcel.writeDouble(lon)
    }

    override fun describeContents(): Int = 0

    companion object CREATOR : android.os.Parcelable.Creator<RouteDestination> {
        override fun createFromParcel(parcel: android.os.Parcel): RouteDestination = RouteDestination(parcel)
        override fun newArray(size: Int): Array<RouteDestination?> = arrayOfNulls(size)
    }
}

data class RoutePoint(
    val lat: Double,
    val lon: Double
) : android.os.Parcelable {
    constructor(parcel: android.os.Parcel) : this(
        lat = parcel.readDouble(),
        lon = parcel.readDouble()
    )

    override fun writeToParcel(parcel: android.os.Parcel, flags: Int) {
        parcel.writeDouble(lat)
        parcel.writeDouble(lon)
    }

    override fun describeContents(): Int = 0

    companion object CREATOR : android.os.Parcelable.Creator<RoutePoint> {
        override fun createFromParcel(parcel: android.os.Parcel): RoutePoint = RoutePoint(parcel)
        override fun newArray(size: Int): Array<RoutePoint?> = arrayOfNulls(size)
    }
}
