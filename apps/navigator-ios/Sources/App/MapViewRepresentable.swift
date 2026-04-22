import SwiftUI
import MapKit

struct MapViewRepresentable: View {
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var navigationService: NavigationService
    @State private var cameraPosition: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var showLocationSearch = false
    @State private var mapSelection: MKMapItem?
    
    var body: some View {
        ZStack(alignment: .top) {
            Map(position: $cameraPosition, selection: $mapSelection) {
                UserAnnotation()
                
                if let route = navigationService.currentRoute {
                    MapPolyline(route.polyline)
                        .stroke(.blue, lineWidth: 5)
                }
                
                ForEach(navigationService.waypoints, id: \.self) { waypoint in
                    Annotation("", coordinate: waypoint.coordinate) {
                        Circle()
                            .fill(waypoint.isDestination ? .red : .green)
                            .frame(width: 12, height: 12)
                    }
                }
                
                if let destination = navigationService.destination {
                    Annotation("Пункт назначения", coordinate: destination.coordinate) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.title)
                            .foregroundColor(.red)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapUserLocationButton()
                MapCompass()
                MapScaleView()
            }
            
            VStack {
                HStack {
                    Button {
                        showLocationSearch = true
                    } label: {
                        HStack {
                            Image(systemName: "magnifyingglass")
                            Text("Куда вы хотите поехать?")
                                .foregroundColor(.secondary)
                        }
                        .padding(12)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.leading, 12)
                    
                    Spacer()
                    
                    if locationManager.isAuthorized {
                        Button {
                            locationManager.centerOnUser()
                        } label: {
                            Image(systemName: "location.fill")
                                .font(.title3)
                                .padding(12)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                        .padding(.trailing, 12)
                    }
                }
                .padding(.top, 50)
                
                Spacer()
            }
            
            if navigationService.isNavigating {
                VStack {
                    Spacer()
                    NavigationCardView()
                        .padding()
                }
            }
        }
        .sheet(isPresented: $showLocationSearch) {
            SearchView()
        }
        .onAppear {
            if locationManager.isAuthorized {
                cameraPosition = .region(MKCoordinateRegion(
                    center: locationManager.currentLocation?.coordinate ?? CLLocationCoordinate2D(latitude: 55.7558, longitude: 37.6173),
                    span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                ))
            }
        }
        .onChange(of: locationManager.currentLocation) { _, newLocation in
            if let location = newLocation, navigationService.isNavigating {
                cameraPosition = .camera(MapCamera(
                    centerCoordinate: location.coordinate,
                    distance: 1000,
                    heading: locationManager.heading,
                    pitch: 45
                ))
            }
        }
    }
}

struct NavigationCardView: View {
    @EnvironmentObject var navigationService: NavigationService
    @EnvironmentObject var locationManager: LocationManager
    
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(navigationService.currentInstruction?.maneuverDescription ?? "Следуйте по маршруту")
                        .font(.headline)
                    if let distance = navigationService.currentInstruction?.distance {
                        Text("Через \(Int(distance)) м")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(navigationService.remainingTime)
                        .font(.title2)
                        .fontWeight(.bold)
                    Text(navigationService.remainingDistance)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            if let step = navigationService.currentInstruction {
                HStack {
                    Image(systemName: step.maneuverIcon)
                        .font(.title)
                        .foregroundColor(.blue)
                    Text(step.fullDescription)
                        .font(.subheadline)
                    Spacer()
                }
            }
            
            HStack(spacing: 16) {
                Button {
                    navigationService.stopNavigation()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title)
                        .foregroundColor(.red)
                }
                
                Button {
                    navigationService.recalculateRoute()
                } label: {
                    Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                        .font(.title)
                        .foregroundColor(.orange)
                }
                
                Spacer()
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    MapViewRepresentable()
        .environmentObject(LocationManager())
        .environmentObject(NavigationService())
}