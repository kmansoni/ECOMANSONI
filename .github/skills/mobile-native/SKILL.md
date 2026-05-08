# Skill: Mobile-Native Bridge (Capacitor)

**Domain:** Capacitor/Cordova bridge, mobile-specific quirks (iOS/Android)  
**Files:** `capacitor.config.ts`, `android/`, `ios/`, `App/` (native), `src/lib/capacitor/`  
**When to apply:** Any native plugin, mobile-only feature, App Store compliance

---

## Knowledge

### Capacitor Plugins
- **Lifecycle**: `app.addListener('appStateChange', ...)`
- **Camera**: `Camera.getPhoto()` (base64 vs file URI)
- **Geolocation**: `Geolocation.getCurrentPosition()` (highAccuracy debounce)
- **Filesystem**: `Filesystem.readFile()`, `writeFile()`, `directory.External`
- **Push Notifications**: `PushNotifications.addListener('pushNotificationReceived')`
- **Haptics**: `Haptics.impact()`, `notification()`
- **Network**: `Network.addListener('networkStatusChange')`

### iOS Quirks (WKWebView)
- **File Access**: `file://` URLs blocked, use `capacitor://` or `http://localhost`
- **Cookies**: WKWebView shares cookies with native, not with iframes
- **LocalStorage**: backed by WKWebsiteDataSource, size limits (~5MB)
- **Session Restoration**: state preservation (UIWebView vs WKWebView)
- **Bluetooth**: requires `NSBluetoothAlwaysUsageDescription`
- **Background Modes**: location, audio, VoIP (特殊 разрешения)

### Android Quirks
- **FileProvider**: `content://` URIs (not `file://`)
- **Storage Permissions**: `READ_EXTERNAL_STORAGE` (legacy), scoped storage (Android 10+)
- **Background Execution**: Doze mode, app standby buckets
- **WebView**: Chromium-based, file access allowed (but needs permission)
- **Notification Channels**: required for Android 8.0+
- **Battery Optimizations**: whitelist for VoIP, alarm manager

### App Store Review Guidelines
- **2.5.1**: apps should not download code (JSI bundles restricted)
- **4.2**: minimum functionality (spam rejection)
- **4.3**: spam (duplicate apps)
- **5.1.1**: privacy — data collection disclosure
- **5.1.2**: tracking — ATT (App Tracking Transparency) prompt timing

### Common Pitfalls
- **Keyboard avoidance**: viewport resize not always propagated
- **Status bar**: safe area insets, notch handling
- **Orientation change**: config changes (savedInstanceState)
- **Memory pressure**: OS can kill background app anytime
- **Deep linking**: `App.deepLink` handler, Universal Links (iOS), App Links (Android)

---

## Quality Gates

1. **Camera preview** starts < 1s
2. **Geolocation accuracy** < 10m (GPS) or < 100m (network)
3. **Push notification delivery** < 5s (FCM/APNs)
4. **App size** < 150MB (App Store Cellular download limit)
5. **Launch time** < 2s (cold start)
6. **Memory** < 200MB typical (not crash under memory pressure)
7. **Background execution** allowed (no blanket kill after 10min)

---

## When to Apply

- New Capacitor plugin integration
- Native camera/photo editor
- File system operations (save to gallery, share)
- Push notification logic
- App lifecycle (pause/resume)
- iOS/Android specific UI (safe area, navigation bar)
- App Store submission checklist
- Camera/photo permissions flow
- Background tasks (sync, upload)
