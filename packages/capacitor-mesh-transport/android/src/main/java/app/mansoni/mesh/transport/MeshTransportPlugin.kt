package app.mansoni.mesh.transport

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy

/**
 * Capacitor-плагин MeshTransport.
 *
 * Использует Google Nearby Connections API — работает поверх BLE + Wi-Fi Direct
 * без роутера и интернета, до 100м в открытом поле, до 3 одновременных линков
 * (P2P_CLUSTER). Полезно для кризисных ситуаций.
 */
@CapacitorPlugin(
    name = "MeshTransport",
    permissions = [
        Permission(
            alias = "bluetooth",
            strings = [
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
            ],
        ),
        Permission(
            alias = "location",
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ],
        ),
    ],
)
class MeshTransportPlugin : Plugin() {

    private lateinit var client: ConnectionsClient
    private val connectedEndpoints = mutableMapOf<String, String>() // endpointId -> displayName

    private var serviceId: String = ""
    private var advertiseName: String = ""

    override fun load() {
        super.load()
        client = Nearby.getConnectionsClient(context)
    }

    // ─── JS API ──────────────────────────────────────────────────────────────

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", true)
        result.put("platform", "android")
        call.resolve(result)
    }

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        val result = JSObject()
        result.put("bluetooth", if (hasBluetoothPermissions()) "granted" else "prompt")
        result.put("network", "granted")
        result.put(
            "location",
            if (Build.VERSION.SDK_INT >= 31) "not-required"
            else if (hasLocationPermissions()) "granted" else "prompt",
        )
        result.put("localNetwork", "not-required")
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        val needed = mutableListOf<String>()
        if (!hasBluetoothPermissions()) needed.add("bluetooth")
        if (Build.VERSION.SDK_INT < 31 && !hasLocationPermissions()) needed.add("location")
        if (needed.isEmpty()) {
            checkPermissions(call)
            return
        }
        requestPermissionForAliases(needed.toTypedArray(), call, "permissionsCallback")
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        checkPermissions(call)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        serviceId = call.getString("serviceId") ?: run {
            call.reject("serviceId required"); return
        }
        advertiseName = call.getString("advertiseName") ?: run {
            call.reject("advertiseName required"); return
        }
        val strategyName = call.getString("strategy") ?: "P2P_CLUSTER"
        val strategy = when (strategyName) {
            "P2P_STAR" -> Strategy.P2P_STAR
            "P2P_POINT_TO_POINT" -> Strategy.P2P_POINT_TO_POINT
            else -> Strategy.P2P_CLUSTER
        }

        val advertisingOptions = AdvertisingOptions.Builder().setStrategy(strategy).build()
        val discoveryOptions = DiscoveryOptions.Builder().setStrategy(strategy).build()

        client.startAdvertising(
            advertiseName,
            serviceId,
            connectionLifecycleCallback,
            advertisingOptions,
        ).addOnFailureListener { e ->
            emitTransportError("advertising failed: ${e.message}")
        }

        client.startDiscovery(
            serviceId,
            endpointDiscoveryCallback,
            discoveryOptions,
        ).addOnSuccessListener {
            call.resolve()
        }.addOnFailureListener { e ->
            call.reject("discovery failed: ${e.message}")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        client.stopAllEndpoints()
        client.stopAdvertising()
        client.stopDiscovery()
        connectedEndpoints.clear()
        call.resolve()
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val endpointId = call.getString("endpointId") ?: run {
            call.reject("endpointId required"); return
        }
        client.requestConnection(advertiseName, endpointId, connectionLifecycleCallback)
            .addOnSuccessListener { call.resolve() }
            .addOnFailureListener { e -> call.reject("connect failed: ${e.message}") }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        val endpointId = call.getString("endpointId") ?: run {
            call.reject("endpointId required"); return
        }
        client.disconnectFromEndpoint(endpointId)
        connectedEndpoints.remove(endpointId)
        call.resolve()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val endpointId = call.getString("endpointId") ?: run {
            call.reject("endpointId required"); return
        }
        val dataB64 = call.getString("data") ?: run {
            call.reject("data required"); return
        }
        val bytes = try {
            Base64.decode(dataB64, Base64.NO_WRAP)
        } catch (e: IllegalArgumentException) {
            call.reject("invalid base64: ${e.message}"); return
        }
        client.sendPayload(endpointId, Payload.fromBytes(bytes))
            .addOnSuccessListener { call.resolve() }
            .addOnFailureListener { e -> call.reject("send failed: ${e.message}") }
    }

    @PluginMethod
    fun broadcast(call: PluginCall) {
        val dataB64 = call.getString("data") ?: run {
            call.reject("data required"); return
        }
        val bytes = try {
            Base64.decode(dataB64, Base64.NO_WRAP)
        } catch (e: IllegalArgumentException) {
            call.reject("invalid base64: ${e.message}"); return
        }
        if (connectedEndpoints.isEmpty()) {
            call.resolve()
            return
        }
        client.sendPayload(connectedEndpoints.keys.toList(), Payload.fromBytes(bytes))
            .addOnSuccessListener { call.resolve() }
            .addOnFailureListener { e -> call.reject("broadcast failed: ${e.message}") }
    }

    // ─── Nearby callbacks ────────────────────────────────────────────────────

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            val ev = JSObject()
            ev.put("peerId", endpointId)
            ev.put("endpointId", endpointId)
            ev.put("displayName", info.endpointName)
            ev.put("deviceType", "android")
            ev.put("rssi", JSObject.NULL)
            notifyListeners("peerFound", ev)
        }

        override fun onEndpointLost(endpointId: String) {
            val ev = JSObject()
            ev.put("peerId", endpointId)
            ev.put("endpointId", endpointId)
            notifyListeners("peerLost", ev)
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            // Автоматически принимаем соединение — аутентификация уже идёт на
            // прикладном уровне через Ed25519 в payload. Nearby-верификация
            // по коду не подходит для автономного mesh.
            client.acceptConnection(endpointId, payloadCallback)
            connectedEndpoints[endpointId] = info.endpointName
            emitConnectionState(endpointId, "connecting")
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            when (result.status.statusCode) {
                ConnectionsStatusCodes.STATUS_OK -> emitConnectionState(endpointId, "connected")
                ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED ->
                    emitConnectionState(endpointId, "failed", "rejected")
                else -> emitConnectionState(
                    endpointId,
                    "failed",
                    "status=${result.status.statusCode}",
                )
            }
        }

        override fun onDisconnected(endpointId: String) {
            connectedEndpoints.remove(endpointId)
            emitConnectionState(endpointId, "disconnected")
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val bytes = payload.asBytes() ?: return
            val ev = JSObject()
            ev.put("from", endpointId)
            ev.put("endpointId", endpointId)
            ev.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
            notifyListeners("payloadReceived", ev)
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            // No-op: мы используем BYTES payload — передача мгновенна.
        }
    }

    // ─── utils ───────────────────────────────────────────────────────────────

    private fun hasBluetoothPermissions(): Boolean {
        if (Build.VERSION.SDK_INT >= 31) {
            return listOf(
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
            ).all { granted(it) }
        }
        return true
    }

    private fun hasLocationPermissions(): Boolean =
        granted(Manifest.permission.ACCESS_FINE_LOCATION) ||
            granted(Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) ==
            PackageManager.PERMISSION_GRANTED

    private fun emitConnectionState(endpointId: String, state: String, error: String? = null) {
        val ev = JSObject()
        ev.put("peerId", endpointId)
        ev.put("endpointId", endpointId)
        ev.put("state", state)
        if (error != null) ev.put("error", error)
        notifyListeners("connectionState", ev)
    }

    private fun emitTransportError(msg: String) {
        val ev = JSObject()
        ev.put("error", msg)
        notifyListeners("transportError", ev)
    }
}
