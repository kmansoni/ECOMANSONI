import SwiftUI
import MapKit

struct RouteView: View {
    @EnvironmentObject var navigationService: NavigationService
    @EnvironmentObject var locationManager: LocationManager
    @State private var waypoints: [Waypoint] = []
    @State private var showAddWaypoint = false
    @State private var selectedTransportType: MKDirectionsTransportType = .automobile
    
    private var transportTypePicker: MKDirectionsTransportType {
        switch selectedTransportType {
        case .automobile: return .automobile
        case .walking: return .walking
        case .cycling: return .cycling
        case .transit: return .transit
        @unknown default: return .automobile
        }
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        TransportTypePicker(selected: $selectedTransportType)
                        
                        if waypoints.isEmpty {
                            EmptyRouteView(onAddStart: addStartPoint, onAddEnd: addEndPoint)
                        } else {
                            WaypointsList(
                                waypoints: waypoints,
                                onMove: moveWaypoint,
                                onDelete: deleteWaypoint
                            )
                            
                            RouteSummaryView(
                                waypoints: waypoints,
                                transportType: selectedTransportType
                            )
                        }
                    }
                    .padding()
                }
                
                if !waypoints.isEmpty {
                    RouteActionButtons(
                        waypoints: waypoints,
                        transportType: selectedTransportType
                    )
                }
            }
            .navigationTitle("Маршрут")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showAddWaypoint = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .disabled(waypoints.count >= 10)
                }
            }
            .sheet(isPresented: $showAddWaypoint) {
                WaypointPickerSheet { waypoint in
                    waypoints.append(waypoint)
                    calculateRoute()
                }
            }
        }
    }
    
    private func addStartPoint() {
        if let location = locationManager.currentLocation {
            let waypoint = Waypoint(
                id: UUID(),
                name: "Текущее местоположение",
                coordinate: location.coordinate,
                type: .start
            )
            waypoints.insert(waypoint, at: 0)
            calculateRoute()
        }
    }
    
    private func addEndPoint() {
        let waypoint = Waypoint(
            id: UUID(),
            name: "Пункт назначения",
            coordinate: CLLocationCoordinate2D(latitude: 55.7558, longitude: 37.6173),
            type: .destination
        )
        waypoints.append(waypoint)
        calculateRoute()
    }
    
    private func moveWaypoint(from: IndexSet, to: Int) {
        waypoints.move(fromOffsets: from, toOffset: to)
        calculateRoute()
    }
    
    private func deleteWaypoint(at offsets: IndexSet) {
        waypoints.remove(atOffsets: offsets)
        calculateRoute()
    }
    
    private func calculateRoute() {
        guard waypoints.count >= 2 else { return }
        navigationService.calculateRoute(waypoints: waypoints, transportType: selectedTransportType)
    }
}

struct TransportTypePicker: View {
    @Binding var selected: MKDirectionsTransportType
    
    private let transportTypes: [(type: MKDirectionsTransportType, icon: String, name: String)] = [
        (.automobile, "car.fill", "Автомобиль"),
        (.walking, "figure.walk", "Пешком"),
        (.cycling, "bicycle", "Велосипед"),
        (.transit, "bus.fill", "Транспорт")
    ]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Тип транспорта")
                .font(.headline)
            
            HStack(spacing: 12) {
                ForEach(transportTypes, id: \.type) { item in
                    Button {
                        selected = item.type
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: item.icon)
                                .font(.title2)
                            Text(item.name)
                                .font(.caption)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(selected == item.type ? Color.blue.opacity(0.1) : Color(.systemGray6))
                        .foregroundColor(selected == item.type ? .blue : .primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(selected == item.type ? Color.blue : Color.clear, lineWidth: 2)
                        )
                    }
                }
            }
        }
    }
}

struct WaypointsList: View {
    let waypoints: [Waypoint]
    let onMove: (IndexSet, Int) -> Void
    let onDelete: (IndexSet) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Точки маршрута")
                .font(.headline)
            
            List {
                ForEach(Array(waypoints.enumerated()), id: \.element.id) { index, waypoint in
                    WaypointRow(waypoint: waypoint, index: index, total: waypoints.count)
                }
                .onMove(perform: onMove)
                .onDelete(perform: onDelete)
            }
            .listStyle(.plain)
        }
    }
}

struct WaypointRow: View {
    let waypoint: Waypoint
    let index: Int
    let total: Int
    
    var body: some View {
        HStack {
            ZStack {
                Circle()
                    .fill(waypoint.type == .start ? Color.green : (waypoint.type == .destination ? Color.red : Color.blue))
                    .frame(width: 24, height: 24)
                Text("\(index + 1)")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(waypoint.name)
                    .font(.headline)
                if let address = waypoint.address {
                    Text(address)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            if index > 0 && index < total - 1 {
                Image(systemName: "line.3.horizontal")
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct EmptyRouteView: View {
    let onAddStart: () -> Void
    let onAddEnd: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            
            Text("Постройте маршрут")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Добавьте начальную и конечную\nточки маршрута")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            
            HStack(spacing: 16) {
                Button(action: onAddStart) {
                    Label("Откуда", systemImage: "circle.dashed")
                }
                .buttonStyle(.bordered)
                
                Button(action: onAddEnd) {
                    Label("Куда", systemImage: "mappin.circle.fill")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(.vertical, 40)
    }
}

struct RouteSummaryView: View {
    let waypoints: [Waypoint]
    let transportType: RouteView.TransportType
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Итоги маршрута")
                .font(.headline)
            
            HStack {
                VStack(alignment: .leading) {
                    Text("Расстояние")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("~25.5 км")
                        .font(.title3)
                        .fontWeight(.semibold)
                }
                
                Spacer()
                
                VStack(alignment: .trailing) {
                    Text("Время в пути")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("~45 мин")
                        .font(.title3)
                        .fontWeight(.semibold)
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

struct RouteActionButtons: View {
    let waypoints: [Waypoint]
    let transportType: RouteView.TransportType
    @EnvironmentObject var navigationService: NavigationService
    
    var body: some View {
        VStack(spacing: 12) {
            Button {
                navigationService.startNavigation()
            } label: {
                Label("Начать навигацию", systemImage: "location.fill")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            
            HStack(spacing: 12) {
                Button {
                    saveRoute()
                } label: {
                    Label("Сохранить", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray6))
                        .foregroundColor(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                
                Button {
                    shareRoute()
                } label: {
                    Label("Поделиться", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray6))
                        .foregroundColor(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }
    
    private func saveRoute() {
        let routeData: [String: Any] = [
            "waypoints": waypoints.map { ["name": $0.name, "lat": $0.coordinate.latitude, "lon": $0.coordinate.longitude] },
            "transportType": transportType.rawValue,
            "date": Date()
        ]
        UserDefaults.standard.set(routeData, forKey: "savedRoute")
    }
    
    private func shareRoute() {
    }
}

struct WaypointPickerSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var locationManager: LocationManager
    let onSelect: (Waypoint) -> Void
    
    @State private var searchText = ""
    @State private var searchResults: [MapItem] = []
    @State private var isSearching = false
    
    var body: some View {
        NavigationStack {
            VStack {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Поиск точки", text: $searchText)
                        .textFieldStyle(.plain)
                        .onChange(of: searchText) { _, newValue in
                            search(query: newValue)
                        }
                }
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding()
                
                if isSearching {
                    ProgressView()
                } else if !searchResults.isEmpty {
                    List(searchResults, id: \.id) { item in
                        Button {
                            let waypoint = Waypoint(
                                id: UUID(),
                                name: item.name,
                                coordinate: item.coordinate,
                                address: item.address,
                                type: .intermediate
                            )
                            onSelect(waypoint)
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: "mappin.circle")
                                    .foregroundColor(.blue)
                                VStack(alignment: .leading) {
                                    Text(item.name)
                                    if let addr = item.address {
                                        Text(addr)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    VStack(spacing: 16) {
                        Button {
                            if let loc = locationManager.currentLocation {
                                let wp = Waypoint(
                                    id: UUID(),
                                    name: "Текущее местоположение",
                                    coordinate: loc.coordinate,
                                    type: .intermediate
                                )
                                onSelect(wp)
                                dismiss()
                            }
                        } label: {
                            Label("Использовать текущее местоположение", systemImage: "location.fill")
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                }
            }
            .navigationTitle("Добавить точку")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func search(query: String) {
        guard query.count >= 2 else { return }
        isSearching = true
        
        Task {
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query
            
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
}

#Preview {
    RouteView()
        .environmentObject(LocationManager())
        .environmentObject(NavigationService())
}