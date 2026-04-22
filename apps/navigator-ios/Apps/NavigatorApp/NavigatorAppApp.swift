import SwiftUI
import MapKit

@main
struct NavigatorAppApp: App {
    @StateObject private var locationManager = LocationManager()
    @StateObject private var navigationService = NavigationService()
    @StateObject private var voiceService = VoiceService()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(locationManager)
                .environmentObject(navigationService)
                .environmentObject(voiceService)
        }
    }
}