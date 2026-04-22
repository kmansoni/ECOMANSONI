import SwiftUI
import MapKit

struct SearchView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var navigationService: NavigationService
    @EnvironmentObject var locationManager: LocationManager
    @State private var searchText = ""
    @State private var searchResults: [MapItem] = []
    @State private var recentLocations: [MapItem] = []
    @State private var isSearching = false
    @FocusState private var isSearchFocused: Bool
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Поиск места", text: $searchText)
                        .textFieldStyle(.plain)
                        .focused($isSearchFocused)
                        .onChange(of: searchText) { _, newValue in
                            performSearch(query: newValue)
                        }
                    
                    if !searchText.isEmpty {
                        Button {
                            searchText = ""
                            searchResults = []
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding()
                
                if isSearching {
                    ProgressView()
                        .padding()
                } else if !searchResults.isEmpty {
                    List(searchResults, id: \.id) { item in
                        SearchResultRow(item: item)
                            .onTapGesture {
                                selectLocation(item)
                            }
                    }
                    .listStyle(.plain)
                } else if searchText.isEmpty {
                    RecentLocationsView(recentLocations: recentLocations, onSelect: selectLocation)
                } else {
                    EmptySearchResultsView()
                }
            }
            .navigationTitle("Поиск")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                isSearchFocused = true
                loadRecentLocations()
            }
        }
    }
    
    private func performSearch(query: String) {
        guard query.count >= 2 else {
            searchResults = []
            return
        }
        
        isSearching = true
        
        Task {
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query
            if let location = locationManager.currentLocation {
                request.region = MKCoordinateRegion(
                    center: location.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.5, longitudeDelta: 0.5)
                )
            }
            
            let search = MKLocalSearch(request: request)
            do {
                let response = try await search.start()
                let items = response.mapItems.map { item in
                    MapItem(
                        id: UUID(),
                        name: item.name ?? "Без названия",
                        coordinate: item.placemark.coordinate,
                        address: item.placemark.title,
                        mapItem: item
                    )
                }
                await MainActor.run {
                    searchResults = items
                    isSearching = false
                }
            } catch {
                await MainActor.run {
                    isSearching = false
                }
            }
        }
    }
    
    private func selectLocation(_ item: MapItem) {
        navigationService.setDestination(item)
        addToRecentLocations(item)
        dismiss()
    }
    
    private func loadRecentLocations() {
        recentLocations = UserDefaults.standard.recentLocations.map { dict in
            MapItem(
                id: UUID(),
                name: dict["name"] ?? "",
                coordinate: CLLocationCoordinate2D(
                    latitude: dict["lat"] ?? 0,
                    longitude: dict["lon"] ?? 0
                ),
                address: dict["address"]
            )
        }
    }
    
    private func addToRecentLocations(_ item: MapItem) {
        var recent = UserDefaults.standard.recentLocations
        let newDict: [String: String] = [
            "name": item.name,
            "lat": String(item.coordinate.latitude),
            "lon": String(item.coordinate.longitude),
            "address": item.address ?? ""
        ]
        
        recent.insert(newDict, at: 0)
        if recent.count > 10 {
            recent = Array(recent.prefix(10))
        }
        
        UserDefaults.standard.recentLocations = recent
    }
}

struct SearchResultRow: View {
    let item: MapItem
    
    var body: some View {
        HStack {
            Image(systemName: "mappin.circle")
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 40)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.headline)
                if let address = item.address {
                    Text(address)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .foregroundColor(.secondary)
        }
    }
}

struct RecentLocationsView: View {
    let recentLocations: [MapItem]
    let onSelect: (MapItem) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !recentLocations.isEmpty {
                Section {
                    ForEach(recentLocations, id: \.id) { item in
                        SearchResultRow(item: item)
                            .onTapGesture {
                                onSelect(item)
                            }
                    }
                } header: {
                    Text("Недавние места")
                        .font(.headline)
                        .padding(.horizontal)
                }
            }
            
            VStack(spacing: 16) {
                QuickActionButton(icon: "house.fill", title: "Дом", subtitle: "Добавьте адрес") {
                }
                QuickActionButton(icon: "briefcase.fill", title: "Работа", subtitle: "Добавьте адрес") {
                }
                QuickActionButton(icon: "star.fill", title: "Избранное", subtitle: "Сохранённые места") {
                }
            }
            .padding()
        }
    }
}

struct QuickActionButton: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.blue)
                    .frame(width: 40)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct EmptySearchResultsView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            
            Text("Ничего не найдено")
                .font(.headline)
            
            Text("Попробуйте изменить запрос или\nпроверьте написание")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

extension UserDefaults {
    var recentLocations: [[String: String]] {
        get {
            guard let data = data(forKey: "recentLocations"),
                  let decoded = try? JSONDecoder().decode([[String: String]].self, from: data) else {
                return []
            }
            return decoded
        }
        set {
            if let encoded = try? JSONEncoder().encode(newValue) {
                set(encoded, forKey: "recentLocations")
            }
        }
    }
}

#Preview {
    SearchView()
        .environmentObject(LocationManager())
        .environmentObject(NavigationService())
}