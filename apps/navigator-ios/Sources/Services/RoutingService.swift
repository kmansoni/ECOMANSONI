import Foundation
import MapKit
import Combine

final class RoutingService: ObservableObject {
    @Published var routeOptions: [RouteInfo] = []
    @Published var isCalculating = false
    @Published var calculationError: Error?
    
    private var currentRoute: MKRoute?
    
    func calculateRoutes(
        from source: CLLocationCoordinate2D,
        to destination: CLLocationCoordinate2D,
        transportType: MKDirectionsTransportType = .automobile,
        avoid: [RouteAttribute] = []
    ) async throws -> [RouteInfo] {
        await MainActor.run { isCalculating = true }
        
        defer {
            Task { @MainActor in
                isCalculating = false
            }
        }
        
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: source))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
        request.transportType = transportType
        request.requestsAlternateRoutes = true
        
        var options: MKDirections.CalculateOptions = []
        if avoid.contains(.tolls) {
            options.insert(.avoidTolls)
        }
        if avoid.contains(.highways) {
            options.insert(.avoidHighways)
        }
        if avoid.contains(.ferries) {
            options.insert(.avoidFerries)
        }
        request.options = options
        
        let directions = MKDirections(request: request)
        
        do {
            let response = try await directions.calculate()
            
            let routes = response.routes.enumerated().map { index, route in
                RouteInfo(
                    id: UUID(),
                    route: route,
                    distance: route.distance,
                    duration: route.expectedTravelTime,
                    transportType: transportType,
                    routeType: index == 0 ? .fastest : .alternative,
                    trafficDelay: route.expectedTravelTime - route.distance / 13.8,
                    polyline: route.polyline
                )
            }
            
            await MainActor.run {
                routeOptions = routes
            }
            
            return routes
        } catch {
            await MainActor.run {
                calculationError = error
            }
            throw error
        }
    }
    
    func calculateOfflineRoute(
        from source: CLLocationCoordinate2D,
        to destination: CLLocationCoordinate2D
    ) -> [CLLocationCoordinate2D] {
        let graph = loadRoadGraph()
        
        let startNode = findNearestNode(to: source, in: graph)
        let endNode = findNearestNode(to: destination, in: graph)
        
        let path = dijkstra(graph: graph, start: startNode, end: endNode)
        
        return path.map { graph.nodes[$0].coordinate }
    }
    
    private func loadRoadGraph() -> RoadGraph {
        var graph = RoadGraph()
        
        graph.nodes = [
            RoadNode(id: 0, coordinate: CLLocationCoordinate2D(latitude: 55.7558, longitude: 37.6173)),
            RoadNode(id: 1, coordinate: CLLocationCoordinate2D(latitude: 55.7568, longitude: 37.6183)),
            RoadNode(id: 2, coordinate: CLLocationCoordinate2D(latitude: 55.7578, longitude: 37.6193)),
            RoadNode(id: 3, coordinate: CLLocationCoordinate2D(latitude: 55.7588, longitude: 37.6203)),
            RoadNode(id: 4, coordinate: CLLocationCoordinate2D(latitude: 55.7598, longitude: 37.6213)),
        ]
        
        graph.edges = [
            RoadEdge(from: 0, to: 1, weight: 150),
            RoadEdge(from: 1, to: 2, weight: 200),
            RoadEdge(from: 2, to: 3, weight: 180),
            RoadEdge(from: 3, to: 4, weight: 220),
            RoadEdge(from: 0, to: 2, weight: 400),
            RoadEdge(from: 1, to: 3, weight: 350),
        ]
        
        return graph
    }
    
    private func findNearestNode(to coordinate: CLLocationCoordinate2D, in graph: RoadGraph) -> Int {
        var nearestNode = 0
        var minDistance = Double.infinity
        
        for node in graph.nodes {
            let dist = distance(from: coordinate, to: node.coordinate)
            if dist < minDistance {
                minDistance = dist
                nearestNode = node.id
            }
        }
        
        return nearestNode
    }
    
    private func distance(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let fromLocation = CLLocation(latitude: from.latitude, longitude: from.longitude)
        let toLocation = CLLocation(latitude: to.latitude, longitude: to.longitude)
        return fromLocation.distance(from: toLocation)
    }
    
    private func dijkstra(graph: RoadGraph, start: Int, end: Int) -> [Int] {
        var distances = [Int: Double]()
        var previous = [Int: Int?]()
        var unvisited = Set(graph.nodes.map { $0.id })
        
        for node in graph.nodes {
            distances[node.id] = Double.infinity
            previous[node.id] = nil
        }
        distances[start] = 0
        
        while !unvisited.isEmpty {
            guard let current = unvisited.min(by: { distances[$0] ?? Double.infinity < distances[$1] ?? Double.infinity }) else {
                break
            }
            
            if current == end {
                break
            }
            
            unvisited.remove(current)
            
            let neighbors = graph.edges.filter { $0.from == current }
            
            for edge in neighbors {
                let newDistance = (distances[current] ?? Double.infinity) + edge.weight
                if newDistance < (distances[edge.to] ?? Double.infinity) {
                    distances[edge.to] = newDistance
                    previous[edge.to] = current
                }
            }
        }
        
        var path: [Int] = []
        var current: Int? = end
        
        while let node = current {
            path.append(node)
            current = previous[node] ?? nil
        }
        
        return path.reversed()
    }
    
    func clearRoutes() {
        routeOptions.removeAll()
        currentRoute = nil
    }
}

struct RouteInfo: Identifiable {
    let id: UUID
    let route: MKRoute
    let distance: Double
    let duration: TimeInterval
    let transportType: MKDirectionsTransportType
    let routeType: RouteType
    let trafficDelay: TimeInterval?
    let polyline: MKPolyline
    
    enum RouteType {
        case fastest
        case shortest
        case alternative
        
        var displayName: String {
            switch self {
            case .fastest: return "Самый быстрый"
            case .shortest: return "Кратчайший"
            case .alternative: return "Альтернативный"
            }
        }
    }
}

enum RouteAttribute {
    case tolls
    case highways
    case ferries
}

struct RoadGraph {
    var nodes: [RoadNode] = []
    var edges: [RoadEdge] = []
}

struct RoadNode {
    let id: Int
    let coordinate: CLLocationCoordinate2D
}

struct RoadEdge {
    let from: Int
    let to: Int
    let weight: Double
}