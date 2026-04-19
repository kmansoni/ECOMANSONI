package com.mansoni.navigator.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavController
import com.mansoni.navigator.offline.LocalDataRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    navController: NavController
) {
    val context = LocalContext.current
    var searchQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<SearchResult>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Поиск") }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Поле поиска
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { query ->
                    searchQuery = query
                    // Поиск в локальной базе
                    performSearch(query, context) { results ->
                        searchResults = results
                        isLoading = false
                    }
                    isLoading = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                placeholder = { Text("Поиск адреса, POI…") },
                singleLine = true
            )

            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(searchResults) { result ->
                        SearchResultItem(
                            result = result,
                            onClick = {
                                // Перейти к месту на карте
                                navController.previousBackStackEntry?.savedStateHandle?.set(
                                    "selectedLocation",
                                    result
                                )
                                navController.popBackStack()
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultItem(
    result: SearchResult,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
        ) {
            Text(
                text = result.title,
                style = MaterialTheme.typography.titleMedium
            )
            if (result.subtitle.isNotEmpty()) {
                Text(
                    text = result.subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun performSearch(
    query: String,
    context: android.content.Context,
    callback: (List<SearchResult>) -> Unit
) {
    // Имитация поиска в локальной базе POI
    // В реальном приложении будет поиск по offlineNominatim или локальной БД
    val results = mutableListOf<SearchResult>()

    if (query.isNotEmpty()) {
        // TODO: Реализовать поиск через LocalRoutingClient
        results.add(
            SearchResult(
                title = "Пример результата: $query",
                subtitle = "ул. Примерная, д. 1",
                lat = 55.751244,
                lon = 37.618423
            )
        )
    }

    callback(results)
}

data class SearchResult(
    val title: String,
    val subtitle: String,
    val lat: Double,
    val lon: Double
)
