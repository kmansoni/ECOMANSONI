import SwiftUI
import MapKit

struct NavigateView: View {
    @EnvironmentObject var navigationService: NavigationService
    @EnvironmentObject var locationManager: LocationManager
    @State private var destinationText = ""
    @State private var selectedRoute: RouteInfo?
    @State private var showRouteOptions = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(spacing: 16) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        TextField("Куда вы хотите поехать?", text: $destinationText)
                            .textFieldStyle(.plain)
                            .onSubmit {
                                searchDestination()
                            }
                        if !destinationText.isEmpty {
                            Button {
                                destinationText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    
                    if let destination = navigationService.destination {
                        DestinationCard(destination: destination)
                    }
                    
                    if !navigationService.routeOptions.isEmpty {
                        VStack(spacing: 8) {
                            ForEach(navigationService.routeOptions, id: \.id) { route in
                                RouteOptionCard(route: route, isSelected: selectedRoute?.id == route.id)
                                    .onTapGesture {
                                        selectedRoute = route
                                        navigationService.selectRoute(route)
                                    }
                            }
                        }
                    }
                }
                .padding()
                
                Spacer()
                
                if navigationService.isNavigating {
                    ActiveNavigationPanel()
                } else if navigationService.destination != nil {
                    StartNavigationButton()
                }
            }
            .navigationTitle("Навигация")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showRouteOptions = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .sheet(isPresented: $showRouteOptions) {
                RouteOptionsSheet()
            }
        }
    }
    
    private func searchDestination() {
        guard !destinationText.isEmpty else { return }
        navigationService.searchDestination(query: destinationText)
    }
}

struct DestinationCard: View {
    let destination: MapItem
    
    var body: some View {
        HStack {
            Image(systemName: "mappin.circle.fill")
                .font(.title2)
                .foregroundColor(.red)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(destination.name)
                    .font(.headline)
                if let address = destination.address {
                    Text(address)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            Button {
            } label: {
                Image(systemName: "star.fill")
                    .foregroundColor(.yellow)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct RouteOptionCard: View {
    let route: RouteInfo
    let isSelected: Bool
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Image(systemName: route.transportType == .car ? "car.fill" : "figure.walk")
                        .foregroundColor(.blue)
                    Text(route.routeType.displayName)
                        .font(.subheadline)
                }
                
                HStack(spacing: 12) {
                    Label("\(route.distance)", systemImage: "arrow.left.arrow.right")
                    Label("\(route.duration)", systemImage: "clock")
                }
                .font(.caption)
                .foregroundColor(.secondary)
                
                if let traffic = route.trafficDelay, traffic > 0 {
                    HStack {
                        Image(systemName: "car.fill")
                            .foregroundColor(.orange)
                        Text("+\(Int(traffic / 60)) мин в пробке")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
            }
            
            Spacer()
            
            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.blue)
            }
        }
        .padding()
        .background(isSelected ? Color.blue.opacity(0.1) : Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
        )
    }
}

struct StartNavigationButton: View {
    @EnvironmentObject var navigationService: NavigationService
    
    var body: some View {
        Button {
            navigationService.startNavigation()
        } label: {
            HStack {
                Image(systemName: "location.fill")
                Text("Начать навигацию")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding()
    }
}

struct ActiveNavigationPanel: View {
    @EnvironmentObject var navigationService: NavigationService
    
    var body: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Прибытие")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(navigationService.arrivalTime)
                        .font(.title2)
                        .fontWeight(.bold)
                }
                
                Spacer()
                
                VStack(alignment: .trailing) {
                    Text("Осталось")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(navigationService.remainingTime)
                        .font(.title2)
                        .fontWeight(.bold)
                }
            }
            
            Divider()
            
            HStack {
                VStack(alignment: .leading) {
                    Text("Расстояние")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(navigationService.remainingDistance)
                        .font(.headline)
                }
                
                Spacer()
                
                if let next = navigationService.nextInstruction {
                    VStack(alignment: .trailing) {
                        Text("Далее")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(next.maneuverDescription)
                            .font(.headline)
                    }
                }
            }
            
            Button {
                navigationService.stopNavigation()
            } label: {
                HStack {
                    Image(systemName: "stop.fill")
                    Text("Завершить навигацию")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.red)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

struct RouteOptionsSheet: View {
    @EnvironmentObject var navigationService: NavigationService
    @Environment(\.dismiss) var dismiss
    @State private var avoidTolls = false
    @State private var avoidHighways = false
    @State private var avoidFerries = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Параметры маршрута") {
                    Toggle("Избегать платных дорог", isOn: $avoidTolls)
                    Toggle("Избегать шоссе", isOn: $avoidHighways)
                    Toggle("Избегать паромов", isOn: $avoidFerries)
                }
                
                Section("Тип маршрута") {
                    Picker("Приоритет", selection: .constant(0)) {
                        Text("Самый быстрый").tag(0)
                        Text("Кратчайший").tag(1)
                        Text("Пешеходный").tag(2)
                    }
                }
            }
            .navigationTitle("Параметры")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Применить") {
                        navigationService.updateRouteOptions(
                            avoidTolls: avoidTolls,
                            avoidHighways: avoidHighways,
                            avoidFerries: avoidFerries
                        )
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    NavigateView()
        .environmentObject(LocationManager())
        .environmentObject(NavigationService())
}