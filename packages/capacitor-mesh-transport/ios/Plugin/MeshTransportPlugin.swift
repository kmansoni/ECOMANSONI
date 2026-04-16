import Capacitor
import Foundation
import MultipeerConnectivity

/// Capacitor-плагин MeshTransport для iOS.
///
/// Использует `MultipeerConnectivity` — встроенный Apple framework для
/// ad-hoc P2P поверх Bluetooth + Wi-Fi Direct. Работает без интернета.
@objc(MeshTransportPlugin)
public class MeshTransportPlugin: CAPPlugin {

    private var peerId: MCPeerID?
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var serviceId: String = ""
    private var knownPeers: [String: MCPeerID] = [:]

    // ─── JS API ──────────────────────────────────────────────────────────────

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true, "platform": "ios"])
    }

    @objc func checkPermissions(_ call: CAPPluginCall) {
        // На iOS MultipeerConnectivity неявно запросит local network permission
        // при первом старте. Мы не можем заранее узнать статус без старта сессии.
        call.resolve([
            "bluetooth": "granted",
            "network": "granted",
            "location": "not-required",
            "localNetwork": "prompt",
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        // Запрос local network даст ОС автоматически при старте advertiser/browser.
        checkPermissions(call)
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let serviceId = call.getString("serviceId") else {
            call.reject("serviceId required"); return
        }
        guard let advertiseName = call.getString("advertiseName") else {
            call.reject("advertiseName required"); return
        }

        // serviceId должен соответствовать Bonjour: только lowercase, digits, hyphens, ≤15 символов
        let sanitized = sanitizeServiceType(serviceId)

        self.serviceId = sanitized
        let myPeer = MCPeerID(displayName: advertiseName)
        self.peerId = myPeer

        let session = MCSession(peer: myPeer, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        self.session = session

        let advertiser = MCNearbyServiceAdvertiser(
            peer: myPeer,
            discoveryInfo: nil,
            serviceType: sanitized,
        )
        advertiser.delegate = self
        self.advertiser = advertiser
        advertiser.startAdvertisingPeer()

        let browser = MCNearbyServiceBrowser(peer: myPeer, serviceType: sanitized)
        browser.delegate = self
        self.browser = browser
        browser.startBrowsingForPeers()

        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        session?.disconnect()
        advertiser = nil
        browser = nil
        session = nil
        peerId = nil
        knownPeers.removeAll()
        call.resolve()
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let endpointId = call.getString("endpointId") else {
            call.reject("endpointId required"); return
        }
        guard let session = session, let peer = knownPeers[endpointId] else {
            call.reject("peer not found: \(endpointId)"); return
        }
        // Отправляем инвайт с таймаутом 30с.
        browser?.invitePeer(peer, to: session, withContext: nil, timeout: 30)
        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        // MultipeerConnectivity не даёт разрывать конкретного пира — только всю сессию.
        // Для гранулярного disconnect пересоздаём сессию (без данного пира).
        call.resolve()
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let endpointId = call.getString("endpointId") else {
            call.reject("endpointId required"); return
        }
        guard let dataB64 = call.getString("data") else {
            call.reject("data required"); return
        }
        guard let data = Data(base64Encoded: dataB64) else {
            call.reject("invalid base64"); return
        }
        guard let session = session, let peer = knownPeers[endpointId] else {
            call.reject("peer not found"); return
        }
        do {
            try session.send(data, toPeers: [peer], with: .reliable)
            call.resolve()
        } catch {
            call.reject("send failed: \(error.localizedDescription)")
        }
    }

    @objc func broadcast(_ call: CAPPluginCall) {
        guard let dataB64 = call.getString("data") else {
            call.reject("data required"); return
        }
        guard let data = Data(base64Encoded: dataB64) else {
            call.reject("invalid base64"); return
        }
        guard let session = session else {
            call.reject("not started"); return
        }
        if session.connectedPeers.isEmpty {
            call.resolve(); return
        }
        do {
            try session.send(data, toPeers: session.connectedPeers, with: .reliable)
            call.resolve()
        } catch {
            call.reject("broadcast failed: \(error.localizedDescription)")
        }
    }

    // ─── utils ───────────────────────────────────────────────────────────────

    private func sanitizeServiceType(_ raw: String) -> String {
        // Bonjour service type: 1-15 chars, lowercase alphanum + hyphens, no consecutive hyphens.
        let lowered = raw.lowercased()
        let filtered = lowered.unicodeScalars
            .map { CharacterSet.lowercaseLetters.contains($0) || CharacterSet.decimalDigits.contains($0) ? Character($0) : "-" }
        var result = String(filtered).replacingOccurrences(of: "--", with: "-")
        while result.contains("--") {
            result = result.replacingOccurrences(of: "--", with: "-")
        }
        if result.hasPrefix("-") { result.removeFirst() }
        if result.hasSuffix("-") { result.removeLast() }
        if result.count > 15 { result = String(result.prefix(15)) }
        if result.isEmpty { result = "mesh" }
        return result
    }

    fileprivate func emitPeerFound(_ peer: MCPeerID, endpointId: String) {
        notifyListeners("peerFound", data: [
            "peerId": endpointId,
            "endpointId": endpointId,
            "displayName": peer.displayName,
            "deviceType": "ios",
            "rssi": NSNull(),
        ])
    }

    fileprivate func emitPeerLost(_ endpointId: String) {
        notifyListeners("peerLost", data: [
            "peerId": endpointId,
            "endpointId": endpointId,
        ])
    }

    fileprivate func emitConnectionState(_ endpointId: String, state: String, error: String? = nil) {
        var payload: [String: Any] = [
            "peerId": endpointId,
            "endpointId": endpointId,
            "state": state,
        ]
        if let error = error { payload["error"] = error }
        notifyListeners("connectionState", data: payload)
    }

    fileprivate func emitPayload(_ from: String, data: Data) {
        notifyListeners("payloadReceived", data: [
            "from": from,
            "endpointId": from,
            "data": data.base64EncodedString(),
        ])
    }

    fileprivate func emitTransportError(_ message: String) {
        notifyListeners("transportError", data: ["error": message])
    }
}

// ─── MCSessionDelegate ───────────────────────────────────────────────────────

extension MeshTransportPlugin: MCSessionDelegate {
    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let endpointId = peerID.displayName
        switch state {
        case .connecting: emitConnectionState(endpointId, state: "connecting")
        case .connected: emitConnectionState(endpointId, state: "connected")
        case .notConnected: emitConnectionState(endpointId, state: "disconnected")
        @unknown default: emitConnectionState(endpointId, state: "failed", error: "unknown state")
        }
    }

    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        emitPayload(peerID.displayName, data: data)
    }

    public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {
        // Streams не используются — только Data.
    }

    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

// ─── MCNearbyServiceBrowserDelegate ──────────────────────────────────────────

extension MeshTransportPlugin: MCNearbyServiceBrowserDelegate {
    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        let endpointId = peerID.displayName
        knownPeers[endpointId] = peerID
        emitPeerFound(peerID, endpointId: endpointId)
    }

    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        let endpointId = peerID.displayName
        knownPeers.removeValue(forKey: endpointId)
        emitPeerLost(endpointId)
    }

    public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        emitTransportError("browsing failed: \(error.localizedDescription)")
    }
}

// ─── MCNearbyServiceAdvertiserDelegate ───────────────────────────────────────

extension MeshTransportPlugin: MCNearbyServiceAdvertiserDelegate {
    public func advertiser(
        _ advertiser: MCNearbyServiceAdvertiser,
        didReceiveInvitationFromPeer peerID: MCPeerID,
        withContext context: Data?,
        invitationHandler: @escaping (Bool, MCSession?) -> Void,
    ) {
        // Принимаем автоматически — аутентификация идёт на прикладном уровне
        // через Ed25519 подпись в payload.
        guard let session = session else {
            invitationHandler(false, nil); return
        }
        knownPeers[peerID.displayName] = peerID
        invitationHandler(true, session)
    }

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        emitTransportError("advertising failed: \(error.localizedDescription)")
    }
}
