## GitHub Copilot Chat

- Extension: 0.39.0 (prod)
- VS Code: 1.111.0 (ce099c1ed25d9eb3076c11e4a280f3eb52b4fbeb)
- OS: win32 10.0.26200 x64
- GitHub Account: mansoni3421

## Network

User Settings:
```json
  "http.systemCertificatesNode": true,
  "github.copilot.advanced.debug.useElectronFetcher": true,
  "github.copilot.advanced.debug.useNodeFetcher": false,
  "github.copilot.advanced.debug.useNodeFetchFetcher": true
```

Connecting to https://api.github.com:
- DNS ipv4 Lookup: 140.82.121.5 (1 ms)
- DNS ipv6 Lookup: Error (5 ms): getaddrinfo ENOTFOUND api.github.com
- Proxy URL: None (1 ms)
- Electron fetch (configured): HTTP 200 (49 ms)
- Node.js https: HTTP 200 (193 ms)
- Node.js fetch: HTTP 200 (45 ms)

Connecting to https://api.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 140.82.113.21 (3 ms)
- DNS ipv6 Lookup: Error (6 ms): getaddrinfo ENOTFOUND api.githubcopilot.com
- Proxy URL: None (13 ms)
- Electron fetch (configured): HTTP 200 (418 ms)
- Node.js https: HTTP 200 (439 ms)
- Node.js fetch: HTTP 200 (419 ms)

Connecting to https://copilot-proxy.githubusercontent.com/_ping:
- DNS ipv4 Lookup: 4.225.11.192 (9 ms)
- DNS ipv6 Lookup: Error (9 ms): getaddrinfo ENOTFOUND copilot-proxy.githubusercontent.com
- Proxy URL: None (1 ms)
- Electron fetch (configured): HTTP 200 (113 ms)
- Node.js https: HTTP 200 (137 ms)
- Node.js fetch: HTTP 200 (128 ms)

Connecting to https://mobile.events.data.microsoft.com: HTTP 404 (804 ms)
Connecting to https://dc.services.visualstudio.com: HTTP 404 (286 ms)
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: HTTP 200 (441 ms)
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: HTTP 200 (439 ms)
Connecting to https://default.exp-tas.com: HTTP 400 (156 ms)

Number of system certificates: 352

## Documentation

In corporate networks: [Troubleshooting firewall settings for GitHub Copilot](https://docs.github.com/en/copilot/troubleshooting-github-copilot/troubleshooting-firewall-settings-for-github-copilot).