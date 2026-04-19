import Foundation
import CoreLocation

final class GeofencingService: NSObject, ObservableObject {
    @Published var monitoredRegions: [CLRegion] = []
    @Published var geofenceEvents: [GeofenceEvent] = []
    
    private let locationManager = CLLocationManager()
    private let maxRegions = 20
    
    override init() {
        super.init()
        locationManager.delegate = self
    }
    
    func startMonitoring(identifier: String, coordinate: CLLocationCoordinate2D, radius: CLLocationDistance) {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
            return
        }
        
        guard monitoredRegions.count < maxRegions else {
            return
        }
        
        let region = CLCircularRegion(
            center: coordinate,
            radius: min(radius, locationManager.maximumRegionMonitoringDistance),
            identifier: identifier
        )
        region.notifyOnEntry = true
        region.notifyOnExit = true
        
        locationManager.startMonitoring(for: region)
        monitoredRegions.append(region)
    }
    
    func stopMonitoring(identifier: String) {
        guard let region = monitoredRegions.first(where: { $0.identifier == identifier }) as? CLCircularRegion else {
            return
        }
        
        locationManager.stopMonitoring(for: region)
        monitoredRegions.removeAll { $0.identifier == identifier }
    }
    
    func stopAllMonitoring() {
        for region in monitoredRegions {
            locationManager.stopMonitoring(for: region)
        }
        monitoredRegions.removeAll()
    }
    
    func requestState(for region: CLRegion) {
        locationManager.requestState(for: region)
    }
}

extension GeofencingService: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        let event = GeofenceEvent(
            id: UUID(),
            type: .entered,
            regionIdentifier: region.identifier,
            timestamp: Date()
        )
        geofenceEvents.append(event)
        
        NotificationCenter.default.post(
            name: .geofenceEntered,
            object: nil,
            userInfo: ["identifier": region.identifier]
        )
    }
    
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        let event = GeofenceEvent(
            id: UUID(),
            type: .exited,
            regionIdentifier: region.identifier,
            timestamp: Date()
        )
        geofenceEvents.append(event)
        
        NotificationCenter.default.post(
            name: .geofenceExited,
            object: nil,
            userInfo: ["identifier": region.identifier]
        )
    }
    
    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        let isInside = state == .inside
        
        NotificationCenter.default.post(
            name: .geofenceStateDetermined,
            object: nil,
            userInfo: ["identifier": region.identifier, "isInside": isInside]
        )
    }
    
    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        if let region = region {
            monitoredRegions.removeAll { $0.identifier == region.identifier }
        }
    }
}

struct GeofenceEvent: Identifiable {
    enum EventType {
        case entered
        case exited
    }
    
    let id: UUID
    let type: EventType
    let regionIdentifier: String
    let timestamp: Date
}

extension Notification.Name {
    static let geofenceEntered = Notification.Name("geofenceEntered")
    static let geofenceExited = Notification.Name("geofenceExited")
    static let geofenceStateDetermined = Notification.Name("geofenceStateDetermined")
}