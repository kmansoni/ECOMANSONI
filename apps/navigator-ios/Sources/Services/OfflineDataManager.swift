import Foundation
import Combine
import SQLite

final class OfflineTileManager: ObservableObject {
    @Published var downloadedTiles: Int = 0
    @Published var cacheSize: Int64 = 0
    @Published var isDownloading = false
    @Published var downloadProgress: Double = 0
    
    private let fileManager = FileManager.default
    private let tileDirectory: URL
    private var db: Connection?
    private let tilesTable = Table("tiles")
    private let idColumn = Expression<Int64>("id")
    private let xColumn = Expression<Int>("x")
    private let yColumn = Expression<Int>("y")
    private let zColumn = Expression<Int>("z")
    private let dataColumn = Expression<Data>("data")
    private let timestampColumn = Expression<Date>("timestamp")
    
    init() {
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        tileDirectory = documentsPath.appendingPathComponent("OfflineTiles", isDirectory: true)
        
        createDirectoryIfNeeded()
        initDatabase()
    }
    
    private func createDirectoryIfNeeded() {
        if !fileManager.fileExists(atPath: tileDirectory.path) {
            try? fileManager.createDirectory(at: tileDirectory, withIntermediateDirectories: true)
        }
    }
    
    private func initDatabase() {
        do {
            let dbPath = tileDirectory.appendingPathComponent("tiles.db").path
            db = try Connection(dbPath)
            
            try db?.run(tilesTable.create(ifNotExists: true) { table in
                table.column(idColumn, primaryKey: .autoincrement)
                table.column(xColumn)
                table.column(yColumn)
                table.column(zColumn)
                table.column(dataColumn)
                table.column(timestampColumn)
            })
            
            try db?.run(tilesTable.createIndex(xColumn, yColumn, zColumn, ifNotExists: true))
            
            updateCacheStats()
        } catch {
            print("Database init error: \(error)")
        }
    }
    
    func getTile(x: Int, y: Int, z: Int) -> Data? {
        guard let db = db else { return nil }
        
        let query = tilesTable.filter(xColumn == x && yColumn == y && zColumn == z)
        
        do {
            if let row = try db.pluck(query) {
                return row[dataColumn]
            }
        } catch {
            print("Get tile error: \(error)")
        }
        
        return nil
    }
    
    func saveTile(x: Int, y: Int, z: Int, data: Data) {
        guard let db = db else { return }
        
        let insert = tilesTable.insert(or: .replace,
            xColumn <- x,
            yColumn <- y,
            zColumn <- z,
            dataColumn <- data,
            timestampColumn <- Date()
        )
        
        do {
            try db.run(insert)
            downloadedTiles += 1
            cacheSize += Int64(data.count)
        } catch {
            print("Save tile error: \(error)")
        }
    }
    
    func downloadRegion(minX: Int, maxX: Int, minY: Int, maxY: Int, z: Int, completion: @escaping (Bool) -> Void) {
        isDownloading = true
        downloadProgress = 0
        
        let totalTiles = (maxX - minX + 1) * (maxY - minY + 1)
        var downloadedCount = 0
        
        let queue = DispatchQueue(label: "tile.download", qos: .background)
        
        for x in minX...maxX {
            for y in minY...maxY {
                queue.async { [weak self] in
                    if let tileData = self?.fetchTileFromLocalServer(x: x, y: y, z: z) {
                        self?.saveTile(x: x, y: y, z: z, data: tileData)
                    }
                    
                    downloadedCount += 1
                    DispatchQueue.main.async {
                        self?.downloadProgress = Double(downloadedCount) / Double(totalTiles)
                        
                        if downloadedCount >= totalTiles {
                            self?.isDownloading = false
                            completion(true)
                        }
                    }
                }
            }
        }
    }
    
    private func fetchTileFromLocalServer(x: Int, y: Int, z: Int) -> Data? {
        let urlString = "http://localhost:8080/tiles/\(z)/\(x)/\(y).png"
        
        guard let url = URL(string: urlString) else { return nil }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        
        let semaphore = DispatchSemaphore(value: 0)
        var result: Data?
        
        let task = URLSession.shared.dataTask(with: request) { data, _, _ in
            result = data
            semaphore.signal()
        }
        
        task.resume()
        _ = semaphore.wait(timeout: .now() + 5)
        
        if result == nil {
            return generatePlaceholderTile(x: x, y: y, z: z)
        }
        
        return result
    }
    
    private func generatePlaceholderTile(x: Int, y: Int, z: Int) -> Data? {
        let size = CGSize(width: 256, height: 256)
        let renderer = UIGraphicsImageRenderer(size: size)
        
        let image = renderer.image { context in
            UIColor.systemGray5.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            
            let text = "\(z)/\n\(x)/\n\(y)"
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 20),
                .foregroundColor: UIColor.systemGray
            ]
            
            let textSize = text.size(withAttributes: attributes)
            let textRect = CGRect(
                x: (size.width - textSize.width) / 2,
                y: (size.height - textSize.height) / 2,
                width: textSize.width,
                height: textSize.height
            )
            
            text.draw(in: textRect, withAttributes: attributes)
        }
        
        return image.pngData()
    }
    
    func deleteTiles(for z: Int) {
        guard let db = db else { return }
        
        let query = tilesTable.filter(zColumn == z)
        
        do {
            try db.run(query.delete())
            updateCacheStats()
        } catch {
            print("Delete tiles error: \(error)")
        }
    }
    
    func clearAllTiles() {
        guard let db = db else { return }
        
        do {
            try db.run(tilesTable.delete())
            downloadedTiles = 0
            cacheSize = 0
        } catch {
            print("Clear tiles error: \(error)")
        }
    }
    
    private func updateCacheStats() {
        guard let db = db else { return }
        
        do {
            downloadedTiles = try db.scalar(tilesTable.count)
            cacheSize = try db.scalar(tilesTable.select(dataColumn.sum)) ?? 0
        } catch {
            print("Update stats error: \(error)")
        }
    }
    
    func tileExists(x: Int, y: Int, z: Int) -> Bool {
        return getTile(x: x, y: y, z: z) != nil
    }
}

import UIKit

final class OfflineRegionManager: ObservableObject {
    @Published var regions: [OfflineRegion] = []
    @Published var activeDownloads: [UUID: Double] = [:]
    
    private let userDefaultsKey = "offlineRegions"
    private let tileManager: OfflineTileManager
    
    init(tileManager: OfflineTileManager = OfflineTileManager()) {
        self.tileManager = tileManager
        loadRegions()
    }
    
    func loadRegions() {
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let decoded = try? JSONDecoder().decode([OfflineRegionData].self, from: data) {
            regions = decoded.map { data in
                OfflineRegion(
                    id: data.id,
                    name: data.name,
                    minLat: data.minLat,
                    maxLat: data.maxLat,
                    minLon: data.minLon,
                    maxLon: data.maxLon,
                    minZ: data.minZ,
                    maxZ: data.maxZ,
                    sizeMB: data.sizeMB,
                    downloadedAt: data.downloadedAt
                )
            }
        }
    }
    
    private func saveRegions() {
        let data = regions.map { region in
            OfflineRegionData(
                id: region.id,
                name: region.name,
                minLat: region.minLat,
                maxLat: region.maxLat,
                minLon: region.minLon,
                maxLon: region.maxLon,
                minZ: region.minZ,
                maxZ: region.maxZ,
                sizeMB: region.sizeMB,
                downloadedAt: region.downloadedAt
            )
        }
        
        if let encoded = try? JSONEncoder().encode(data) {
            UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
        }
    }
    
    func downloadRegion(
        name: String,
        minLat: Double,
        maxLat: Double,
        minLon: Double,
        maxLon: Double,
        minZ: Int = 10,
        maxZ: Int = 16,
        completion: @escaping (Bool) -> Void
    ) {
        let regionId = UUID()
        activeDownloads[regionId] = 0
        
        let tileBounds = calculateTileBounds(
            minLat: minLat,
            maxLat: maxLat,
            minLon: minLon,
            maxLon: maxLon,
            z: maxZ
        )
        
        var totalTiles = 0
        for z in minZ...maxZ {
            let bounds = calculateTileBounds(
                minLat: minLat,
                maxLat: maxLat,
                minLon: minLon,
                maxLon: maxLon,
                z: z
            )
            totalTiles += (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)
        }
        
        var downloadedTiles = 0
        
        for z in minZ...maxZ {
            let bounds = calculateTileBounds(
                minLat: minLat,
                maxLat: maxLat,
                minLon: minLon,
                maxLon: maxLon,
                z: z
            )
            
            tileManager.downloadRegion(
                minX: bounds.minX,
                maxX: bounds.maxX,
                minY: bounds.minY,
                maxY: bounds.maxY,
                z: z
            ) { [weak self] success in
                downloadedTiles += 1
                
                let progress = Double(downloadedTiles) / Double(totalTiles)
                self?.activeDownloads[regionId] = progress
                
                if downloadedTiles >= totalTiles {
                    let region = OfflineRegion(
                        id: regionId,
                        name: name,
                        minLat: minLat,
                        maxLat: maxLat,
                        minLon: minLon,
                        maxLon: maxLon,
                        minZ: minZ,
                        maxZ: maxZ,
                        sizeMB: totalTiles * 15 / 1024,
                        downloadedAt: Date()
                    )
                    
                    self?.regions.append(region)
                    self?.saveRegions()
                    self?.activeDownloads.removeValue(forKey: regionId)
                    completion(true)
                }
            }
        }
    }
    
    func deleteRegion(_ region: OfflineRegion) {
        for z in region.minZ...region.maxZ {
            tileManager.deleteTiles(for: z)
        }
        
        regions.removeAll { $0.id == region.id }
        saveRegions()
    }
    
    func deleteAllRegions() {
        tileManager.clearAllTiles()
        regions.removeAll()
        saveRegions()
    }
    
    private func calculateTileBounds(
        minLat: Double,
        maxLat: Double,
        minLon: Double,
        maxLon: Double,
        z: Int
    ) -> (minX: Int, maxX: Int, minY: Int, maxY: Int) {
        let minX = lonToTileX(lon: minLon, z: z)
        let maxX = lonToTileX(lon: maxLon, z: z)
        let minY = latToTileY(lat: maxLat, z: z)
        let maxY = latToTileY(lat: minLat, z: z)
        
        return (minX, maxX, minY, maxY)
    }
    
    private func lonToTileX(lon: Double, z: Int) -> Int {
        return Int(floor((lon + 180.0) / 360.0 * pow(2.0, Double(z))))
    }
    
    private func latToTileY(lat: Double, z: Int) -> Int {
        let latRad = lat * .pi / 180.0
        return Int(floor((1.0 - asinh(tan(latRad)) / .pi) / 2.0 * pow(2.0, Double(z))))
    }
}

struct OfflineRegionData: Codable {
    let id: UUID
    let name: String
    let minLat: Double
    let maxLat: Double
    let minLon: Double
    let maxLon: Double
    let minZ: Int
    let maxZ: Int
    let sizeMB: Int
    let downloadedAt: Date
}

struct OfflineRegion: Identifiable {
    let id: UUID
    let name: String
    let minLat: Double
    let maxLat: Double
    let minLon: Double
    let maxLon: Double
    let minZ: Int
    let maxZ: Int
    let sizeMB: Int
    let downloadedAt: Date
}