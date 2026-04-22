import SwiftUI
import MapKit

struct ContentView: View {
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var navigationService: NavigationService
    @State private var selectedTab: Tab = .map
    @State private var showSearch = false
    @State private var showSettings = false
    
    enum Tab {
        case map, navigate, route, settings
    }
    
    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                MapViewRepresentable()
                    .tag(Tab.map)
                
                NavigateView()
                    .tag(Tab.navigate)
                
                RouteView()
                    .tag(Tab.route)
                
                SettingsView()
                    .tag(Tab.settings)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            
            HStack(spacing: 20) {
                TabButton(icon: "map", label: "Карта", isSelected: selectedTab == .map) {
                    selectedTab = .map
                }
                TabButton(icon: "arrow.triangle.turn.up.right.diamond", label: "Навигация", isSelected: selectedTab == .navigate) {
                    selectedTab = .navigate
                }
                TabButton(icon: "point.topleft.down.curvedto.point.bottomright.up", label: "Маршрут", isSelected: selectedTab == .route) {
                    selectedTab = .route
                }
                TabButton(icon: "gearshape", label: "Настройки", isSelected: selectedTab == .settings) {
                    selectedTab = .settings
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .padding(.horizontal)
            .padding(.bottom, 10)
        }
        .sheet(isPresented: $showSearch) {
            SearchView()
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
    }
}

struct TabButton: View {
    let icon: String
    let label: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .medium))
                Text(label)
                    .font(.caption2)
            }
            .foregroundColor(isSelected ? .blue : .gray)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(LocationManager())
        .environmentObject(NavigationService())
        .environmentObject(VoiceService())
}