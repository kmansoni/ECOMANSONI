import Foundation
import Network

final class LocalTileServer {
    static let shared = LocalTileServer()
    
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.navigator.tileserver")
    private var isRunning = false
    
    private let port: UInt16 = 8080
    
    private init() {}
    
    func start() {
        guard !isRunning else { return }
        
        do {
            let parameters = NWParameters.tcp
            parameters.allowLocalEndpointReuse = true
            
            listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: port)!)
            
            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }
            
            listener?.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    print("Local tile server started on port \(self.port)")
                case .failed(let error):
                    print("Server failed: \(error)")
                default:
                    break
                }
            }
            
            listener?.start(queue: queue)
            isRunning = true
        } catch {
            print("Failed to start local tile server: \(error)")
        }
    }
    
    func stop() {
        listener?.cancel()
        listener = nil
        isRunning = false
    }
    
    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            if let data = data, !data.isEmpty {
                self?.processRequest(data: data, connection: connection)
            }
            
            if isComplete || error != nil {
                connection.cancel()
            }
        }
    }
    
    private func processRequest(data: Data, connection: NWConnection) {
        guard let requestString = String(data: data, encoding: .utf8) else {
            send404(connection: connection)
            return
        }
        
        let lines = requestString.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            send404(connection: connection)
            return
        }
        
        let parts = requestLine.components(separatedBy: " ")
        guard parts.count >= 2 else {
            send404(connection: connection)
            return
        }
        
        let path = parts[1]
        
        if path.hasPrefix("/tiles/") {
            handleTileRequest(path: path, connection: connection)
        } else if path == "/health" {
            sendHealthResponse(connection: connection)
        } else {
            send404(connection: connection)
        }
    }
    
    private func handleTileRequest(path: String, connection: NWConnection) {
        let components = path
            .replacingOccurrences(of: "/tiles/", with: "")
            .components(separatedBy: "/")
        
        guard components.count == 3,
              let z = Int(components[0]),
              let x = Int(components[1]),
              let y = Int(components[2].replacingOccurrences(of: ".png", with: "")) else {
            send404(connection: connection)
            return
        }
        
        let tileManager = OfflineTileManager()
        
        if let tileData = tileManager.getTile(x: x, y: y, z: z) {
            sendTileResponse(data: tileData, connection: connection)
        } else {
            let placeholder = generatePlaceholderTileData(x: x, y: y, z: z)
            sendTileResponse(data: placeholder, connection: connection)
        }
    }
    
    private func sendTileResponse(data: Data, connection: NWConnection) {
        var response = "HTTP/1.1 200 OK\r\n"
        response += "Content-Type: image/png\r\n"
        response += "Content-Length: \(data.count)\r\n"
        response += "Cache-Control: public, max-age=86400\r\n"
        response += "Connection: close\r\n"
        response += "\r\n"
        
        var responseData = response.data(using: .utf8)!
        responseData.append(data)
        
        connection.send(content: responseData, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
    
    private func sendHealthResponse(connection: NWConnection) {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\nConnection: close\r\n\r\n{\"status\":\"ok\"}"
        
        if let data = response.data(using: .utf8) {
            connection.send(content: data, completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }
    
    private func send404(connection: NWConnection) {
        let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        
        if let data = response.data(using: .utf8) {
            connection.send(content: data, completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }
    
    private func generatePlaceholderTileData(x: Int, y: Int, z: Int) -> Data {
        let size = CGSize(width: 256, height: 256)
        let renderer = UIGraphicsImageRenderer(size: size)
        
        let image = renderer.image { context in
            UIColor.systemGray5.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            
            let text = "\(z)/\(x)/\(y)"
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
        
        return image.pngData() ?? Data()
    }
}

import UIKit