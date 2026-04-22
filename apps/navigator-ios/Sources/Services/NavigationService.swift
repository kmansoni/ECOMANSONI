import Foundation
import MapKit
import Combine

final class NavigationService: ObservableObject {
    @Published var destination: MapItem?
    @Published var currentRoute: RouteInfo?
    @Published var isNavigating = false
    @Published var currentInstruction: NavigationInstruction?
    @Published var nextInstruction: NavigationInstruction?
    @Published var remainingDistance: String = "0 км"
    @Published var remainingTime: String = "0 мин"
    @Published var arrivalTime: String = "--:--"
    @Published var waypoints: [Waypoint] = []
    @Published var routeOptions: [RouteInfo] = []
    
    private var routingService = RoutingService()
    private var cancellables = Set<AnyCancellable>()
    private var locationManager: LocationManager?
    private var navigationInstructions: [NavigationInstruction] = []
    private var currentInstructionIndex = 0
    
    var currentLocation: CLLocationCoordinate2D? {
        locationManager?.currentLocation?.coordinate
    }
    
    func setLocationManager(_ manager: LocationManager) {
        self.locationManager = manager
        
        NotificationCenter.default.publisher(for: .locationDidUpdate)
            .compactMap { $0.userInfo?["location"] as? CLLocation }
            .sink { [weak self] location in
                self?.updateNavigationPosition(location.coordinate)
            }
            .store(in: &cancellables)
    }
    
    func setDestination(_ item: MapItem) {
        destination = item
        
        guard let userLocation = locationManager?.currentLocation else { return }
        
        Task {
            do {
                let routes = try await routingService.calculateRoutes(
                    from: userLocation.coordinate,
                    to: item.coordinate
                )
                
                await MainActor.run {
                    self.routeOptions = routes
                    if let first = routes.first {
                        selectRoute(first)
                    }
                }
            } catch {
                print("Route calculation error: \(error)")
            }
        }
    }
    
    func searchDestination(query: String) {
        guard !query.isEmpty else { return }
        
        Task {
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query
            
            let search = MKLocalSearch(request: request)
            do {
                let response = try await search.start()
                if let firstItem = response.mapItems.first {
                    let item = MapItem(
                        id: UUID(),
                        name: firstItem.name ?? "Пункт назначения",
                        coordinate: firstItem.placemark.coordinate,
                        address: firstItem.placemark.title,
                        mapItem: firstItem
                    )
                    await MainActor.run {
                        self.destination = item
                    }
                    setDestination(item)
                }
            } catch {
                print("Search error: \(error)")
            }
        }
    }
    
    func selectRoute(_ route: RouteInfo) {
        currentRoute = route
        parseInstructions(from: route)
    }
    
    func startNavigation() {
        guard currentRoute != nil else { return }
        isNavigating = true
        currentInstructionIndex = 0
        
        if let first = navigationInstructions.first {
            currentInstruction = first
            nextInstruction = navigationInstructions.count > 1 ? navigationInstructions[1] : nil
        }
        
        NotificationCenter.default.post(name: .navigationStarted, object: nil)
    }
    
    func stopNavigation() {
        isNavigating = false
        currentInstruction = nil
        nextInstruction = nil
        currentInstructionIndex = 0
        
        NotificationCenter.default.post(name: .navigationStopped, object: nil)
    }
    
    func recalculateRoute() {
        guard let dest = destination,
              let userLocation = locationManager?.currentLocation else { return }
        
        Task {
            do {
                let routes = try await routingService.calculateRoutes(
                    from: userLocation.coordinate,
                    to: dest.coordinate
                )
                
                await MainActor.run {
                    if let first = routes.first {
                        self.currentRoute = first
                        self.parseInstructions(from: first)
                        self.startNavigation()
                    }
                }
            } catch {
                print("Recalculation error: \(error)")
            }
        }
    }
    
    func calculateRoute(waypoints: [Waypoint], transportType: MKDirectionsTransportType) {
        guard waypoints.count >= 2 else { return }
        
        Task {
            var allRoutes: [RouteInfo] = []
            
            for i in 0..<(waypoints.count - 1) {
                let from = waypoints[i].coordinate
                let to = waypoints[i + 1].coordinate
                
                do {
                    let routes = try await routingService.calculateRoutes(
                        from: from,
                        to: to,
                        transportType: transportType
                    )
                    allRoutes.append(contentsOf: routes)
                } catch {
                    print("Error calculating route segment: \(error)")
                }
            }
            
            await MainActor.run {
                self.routeOptions = allRoutes
                if let first = allRoutes.first {
                    selectRoute(first)
                }
            }
        }
    }
    
    func updateRouteOptions(avoidTolls: Bool, avoidHighways: Bool, avoidFerries: Bool) {
        guard let dest = destination,
              let userLocation = locationManager?.currentLocation else { return }
        
        var avoid: [RouteAttribute] = []
        if avoidTolls { avoid.append(.tolls) }
        if avoidHighways { avoid.append(.highways) }
        if avoidFerries { avoid.append(.ferries) }
        
        Task {
            do {
                let routes = try await routingService.calculateRoutes(
                    from: userLocation.coordinate,
                    to: dest.coordinate,
                    avoid: avoid
                )
                
                await MainActor.run {
                    self.routeOptions = routes
                    if let first = routes.first {
                        selectRoute(first)
                    }
                }
            } catch {
                print("Error updating route: \(error)")
            }
        }
    }
    
    private func parseInstructions(from route: RouteInfo) {
        navigationInstructions.removeAll()
        
        let steps = route.route.steps
        
        for (index, step) in steps.enumerated() {
            let instruction = NavigationInstruction(
                id: UUID(),
                maneuverDescription: step.instructions,
                fullDescription: "\(step.instructions) (\(Int(step.distance)) м)",
                distance: step.distance,
                maneuverType: parseManeuverType(from: step.instructions),
                maneuverIcon: parseManeuverIcon(from: step.instructions),
                coordinate: step.polyline.coordinate,
                index: index
            )
            navigationInstructions.append(instruction)
        }
    }
    
    private func parseManeuverType(from instructions: String) -> ManeuverType {
        let lowercased = instructions.lowercased()
        
        if lowercased.contains("поверните направо") || lowercased.contains("направо") {
            return .turnRight
        } else if lowercased.contains("поверните налево") || lowercased.contains("налево") {
            return .turnLeft
        } else if lowercased.contains("развернитесь") {
            return .uTurn
        } else if lowercased.contains("продолжайте") {
            return .continue
        } else if lowercased.contains("на roundabout") || lowercased.contains("кольцо") {
            return .roundabout
        } else if lowercased.contains("прибыли") || lowercased.contains("конец") {
            return .arrive
        }
        return .continue
    }
    
    private func parseManeuverIcon(from instructions: String) -> String {
        let lowercased = instructions.lowercased()
        
        if lowercased.contains("направо") && lowercased.contains("налево") {
            return "arrow.turn.up-left.arrow.down-right"
        } else if lowercased.contains("направо") {
            return "arrow.turn.up.right"
        } else if lowercased.contains("налево") {
            return "arrow.turn.up.left"
        } else if lowercased.contains("разворот") {
            return "arrow.uturn.down"
        } else if lowercased.contains("кольцо") || lowercased.contains("roundabout") {
            return "arrow.triangle.2.circlepath"
        } else if lowercased.contains("продолжайте") || lowercased.contains("прямо") {
            return "arrow.up"
        } else if lowercased.contains("прибыли") || lowercased.contains("конец") {
            return "mappin"
        }
        return "arrow.up"
    }
    
    private func updateNavigationPosition(_ coordinate: CLLocationCoordinate2D) {
        guard isNavigating, !navigationInstructions.isEmpty else { return }
        
        let currentStep = navigationInstructions[currentInstructionIndex]
        let distanceToManeuver = distance(from: coordinate, to: currentStep.coordinate)
        
        if distanceToManeuver < 30 && currentInstructionIndex < navigationInstructions.count - 1 {
            currentInstructionIndex += 1
            currentInstruction = navigationInstructions[currentInstructionIndex]
            nextInstruction = currentInstructionIndex + 1 < navigationInstructions.count
                ? navigationInstructions[currentInstructionIndex + 1]
                : nil
            
            NotificationCenter.default.post(
                name: .navigationInstructionChanged,
                object: nil,
                userInfo: ["instruction": currentInstruction as Any]
            )
        }
        
        updateRemainingInfo()
    }
    
    private func updateRemainingInfo() {
        guard let route = currentRoute else { return }
        
        let totalDistance = navigationInstructions
            .suffix(from: currentInstructionIndex)
            .reduce(0) { $0 + $1.distance }
        
        let totalTime = navigationInstructions
            .suffix(from: currentInstructionIndex)
            .reduce(0) { $0 + ($1.distance / 13.8) }
        
        remainingDistance = formatDistance(totalDistance)
        remainingTime = formatTime(totalTime)
        
        let arrival = Date().addingTimeInterval(totalTime)
        arrivalTime = formatTimeOfDay(arrival)
    }
    
    private func distance(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let fromLocation = CLLocation(latitude: from.latitude, longitude: from.longitude)
        let toLocation = CLLocation(latitude: to.latitude, longitude: to.longitude)
        return fromLocation.distance(from: toLocation)
    }
    
    private func formatDistance(_ meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.1f км", meters / 1000)
        }
        return "\(Int(meters)) м"
    }
    
    private func formatTime(_ seconds: Double) -> String {
        let minutes = Int(seconds / 60)
        if minutes >= 60 {
            let hours = minutes / 60
            let mins = minutes % 60
            return "\(hours) ч \(mins) мин"
        }
        return "\(minutes) мин"
    }
    
    private func formatTimeOfDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

extension Notification.Name {
    static let navigationStarted = Notification.Name("navigationStarted")
    static let navigationStopped = Notification.Name("navigationStopped")
    static let navigationInstructionChanged = Notification.Name("navigationInstructionChanged")
}

struct NavigationInstruction: Identifiable {
    let id: UUID
    let maneuverDescription: String
    let fullDescription: String
    let distance: Double
    let maneuverType: ManeuverType
    let maneuverIcon: String
    let coordinate: CLLocationCoordinate2D
    let index: Int
}

enum ManeuverType {
    case turnLeft
    case turnRight
    case uTurn
    case continueStraight
    case roundabout
    case arrive
    case continue
}

struct Waypoint: Identifiable {
    let id: UUID
    var name: String
    var coordinate: CLLocationCoordinate2D
    var address: String?
    var type: WaypointType
    
    enum WaypointType {
        case start
        case intermediate
        case destination
    }
    
    var isDestination: Bool {
        type == .destination
    }
}

struct MapItem: Identifiable {
    let id: UUID
    let name: String
    let coordinate: CLLocationCoordinate2D
    let address: String?
    var mapItem: MKMapItem?
}