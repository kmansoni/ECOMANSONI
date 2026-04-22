import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var navigationService: NavigationService
    @EnvironmentObject var voiceService: VoiceService
    @AppStorage("voiceGuidanceEnabled") private var voiceGuidanceEnabled = true
    @AppStorage("voiceVolume") private var voiceVolume = 0.8
    @AppStorage("mapStyle") private var mapStyle = "standard"
    @AppStorage("distanceUnit") private var distanceUnit = "km"
    @AppStorage("offlineModeEnabled") private var offlineModeEnabled = false
    @State private var showOfflineMaps = false
    @State private var showAbout = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Навигация") {
                    Toggle("Голосовые подсказки", isOn: $voiceGuidanceEnabled)
                    
                    if voiceGuidanceEnabled {
                        VStack(alignment: .leading) {
                            Text("Громкость подсказок")
                            Slider(value: $voiceVolume, in: 0...1)
                        }
                        
                        Picker("Язык подсказок", selection: .constant("ru")) {
                            Text("Русский").tag("ru")
                            Text("English").tag("en")
                        }
                    }
                    
                    Picker("Единицы расстояния", selection: $distanceUnit) {
                        Text("Километры").tag("km")
                        Text("Мили").tag("mi")
                    }
                    
                    Toggle("Избегать платных дорог", isOn: .constant(false))
                    Toggle("Избегать шоссе", isOn: .constant(false))
                }
                
                Section("Карта") {
                    Picker("Стиль карты", selection: $mapStyle) {
                        Text("Стандартный").tag("standard")
                        Text("Спутник").tag("satellite")
                        Text("Рельеф").tag("terrain")
                        Text("Ночной").tag("night")
                    }
                    
                    NavigationLink {
                        OfflineMapsView()
                    } label: {
                        HStack {
                            Text("Офлайн карты")
                            Spacer()
                            Text("\(downloadedRegionsCount) регионов")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Section("Местоположение") {
                    HStack {
                        Text("Статус")
                        Spacer()
                        Text(locationStatusText)
                            .foregroundColor(locationStatusColor)
                    }
                    
                    Button("Обновить местоположение") {
                        locationManager.requestLocation()
                    }
                    
                    NavigationLink {
                        LocationPermissionsView()
                    } label: {
                        Text("Разрешения")
                    }
                    
                    NavigationLink {
                        GeofencesListView()
                    } label: {
                        Text("Геозоны")
                    }
                }
                
                Section("Данные") {
                    NavigationLink {
                        SavedRoutesView()
                    } label: {
                        Text("Сохранённые маршруты")
                    }
                    
                    NavigationLink {
                        RecentSearchesView()
                    } label: {
                        Text("История поиска")
                    }
                    
                    Button("Очистить кэш") {
                        clearCache()
                    }
                    .foregroundColor(.red)
                }
                
                Section("О приложении") {
                    HStack {
                        Text("Версия")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    
                    Button("О приложении") {
                        showAbout = true
                    }
                }
            }
            .navigationTitle("Настройки")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
    
    private var locationStatusText: String {
        switch locationManager.authorizationStatus {
        case .notDetermined: return "Не определён"
        case .restricted: return "Ограничен"
        case .denied: return "Отклонён"
        case .authorizedWhenInUse: return "Когда используется"
        case .authorizedAlways: return "Всегда"
        @unknown default: return "Неизвестно"
        }
    }
    
    private var locationStatusColor: Color {
        switch locationManager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: return .green
        case .notDetermined: return .orange
        default: return .red
        }
    }
    
    private var downloadedRegionsCount: Int {
        UserDefaults.standard.integer(forKey: "offlineRegionsCount")
    }
    
    private func clearCache() {
        URLCache.shared.removeAllCachedResponses()
        UserDefaults.standard.removeObject(forKey: "recentLocations")
    }
}

struct OfflineMapsView: View {
    @State private var regions: [OfflineRegion] = []
    @State private var isDownloading = false
    @State private var downloadProgress: Double = 0
    
    var body: some View {
        List {
            Section {
                Button {
                    downloadSampleRegion()
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.blue)
                        Text("Загрузить регион")
                    }
                }
            }
            
            Section("Загруженные регионы") {
                if regions.isEmpty {
                    Text("Нет загруженных регионов")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(regions, id: \.id) { region in
                        OfflineRegionRow(region: region)
                    }
                }
            }
            
            Section("Хранилище") {
                HStack {
                    Text("Использовано")
                    Spacer()
                    Text("\(totalStorageUsed) МБ")
                        .foregroundColor(.secondary)
                }
                
                Button("Удалить все офлайн данные") {
                    deleteAllRegions()
                }
                .foregroundColor(.red)
            }
        }
        .navigationTitle("Офлайн карты")
    }
    
    private var totalStorageUsed: Int {
        regions.reduce(0) { $0 + $1.sizeMB }
    }
    
    private func downloadSampleRegion() {
        isDownloading = true
        downloadProgress = 0
        
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            downloadProgress += 0.1
            if downloadProgress >= 1.0 {
                timer.invalidate()
                isDownloading = false
                regions.append(OfflineRegion(
                    id: UUID(),
                    name: "Москва и область",
                    minLat: 55.0, maxLat: 56.0,
                    minLon: 37.0, maxLon: 38.0,
                    sizeMB: 150,
                    downloadedAt: Date()
                ))
                UserDefaults.standard.set(regions.count, forKey: "offlineRegionsCount")
            }
        }
    }
    
    private func deleteAllRegions() {
        regions.removeAll()
        UserDefaults.standard.set(0, forKey: "offlineRegionsCount")
    }
}

struct OfflineRegion: Identifiable {
    let id: UUID
    let name: String
    let minLat: Double, maxLat: Double
    let minLon: Double, maxLon: Double
    let sizeMB: Int
    let downloadedAt: Date
}

struct OfflineRegionRow: View {
    let region: OfflineRegion
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(region.name)
                .font(.headline)
            Text("\(region.sizeMB) МБ • \(region.downloadedAt.formatted())")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

struct LocationPermissionsView: View {
    @EnvironmentObject var locationManager: LocationManager
    
    var body: some View {
        List {
            Section("Разрешения") {
                PermissionRow(
                    title: "Когда используется",
                    description: "Для навигации во время использования",
                    isEnabled: locationManager.authorizationStatus == .authorizedWhenInUse || locationManager.authorizationStatus == .authorizedAlways
                )
                
                PermissionRow(
                    title: "Всегда",
                    description: "Фоновая навигация и геозоны",
                    isEnabled: locationManager.authorizationStatus == .authorizedAlways
                )
            }
            
            Section {
                Button("Открыть настройки") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
            }
        }
        .navigationTitle("Разрешения")
    }
}

struct PermissionRow: View {
    let title: String
    let description: String
    let isEnabled: Bool
    
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(title)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: isEnabled ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(isEnabled ? .green : .red)
        }
    }
}

struct GeofencesListView: View {
    @State private var geofences: [Geofence] = []
    
    var body: some View {
        List {
            Section {
                Button {
                    addGeofence()
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.blue)
                        Text("Добавить геозону")
                    }
                }
            }
            
            Section("Мои геозоны") {
                if geofences.isEmpty {
                    Text("Нет геозон")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(geofences, id: \.id) { geofence in
                        GeofenceRow(geofence: geofence)
                    }
                }
            }
        }
        .navigationTitle("Геозоны")
    }
    
    private func addGeofence() {
    }
}

struct Geofence: Identifiable {
    let id: UUID
    let name: String
    let radius: Double
    let coordinate: (lat: Double, lon: Double)
    let isActive: Bool
}

struct GeofenceRow: View {
    let geofence: Geofence
    
    var body: some View {
        HStack {
            Image(systemName: geofence.isActive ? "circle.fill" : "circle")
                .foregroundColor(geofence.isActive ? .green : .gray)
            
            VStack(alignment: .leading) {
                Text(geofence.name)
                    .font(.headline)
                Text("Радиус: \(Int(geofence.radius)) м")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct SavedRoutesView: View {
    @State private var savedRoutes: [[String: Any]] = []
    
    var body: some View {
        List {
            if savedRoutes.isEmpty {
                Text("Нет сохранённых маршрутов")
                    .foregroundColor(.secondary)
            } else {
                ForEach(Array(savedRoutes.enumerated()), id: \.offset) { index, route in
                    SavedRouteRow(route: route)
                }
            }
        }
        .navigationTitle("Сохранённые маршруты")
    }
}

struct SavedRouteRow: View {
    let route: [String: Any]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Маршрут")
                .font(.headline)
            if let date = route["date"] as? Date {
                Text(date.formatted())
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct RecentSearchesView: View {
    @State private var recentSearches: [String] = []
    
    var body: some View {
        List {
            if recentSearches.isEmpty {
                Text("Нет истории поиска")
                    .foregroundColor(.secondary)
            } else {
                ForEach(recentSearches, id: \.self) { search in
                    Text(search)
                }
                .onDelete { indexSet in
                    recentSearches.remove(atOffsets: indexSet)
                }
            }
        }
        .navigationTitle("История поиска")
        .toolbar {
            if !recentSearches.isEmpty {
                Button("Очистить") {
                    recentSearches.removeAll()
                }
            }
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(LocationManager())
        .environmentObject(NavigationService())
        .environmentObject(VoiceService())
}