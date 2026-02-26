## GitHub Copilot Chat

- Extension: 0.37.7 (prod)
- VS Code: 1.109.5 (072586267e68ece9a47aa43f8c108e0dcbf44622)
- OS: win32 10.0.26100 x64
- GitHub Account: kmansoni

## Network

User Settings:
```json
  "http.systemCertificatesNode": true,
  "github.copilot.advanced.debug.useElectronFetcher": true,
  "github.copilot.advanced.debug.useNodeFetcher": false,
  "github.copilot.advanced.debug.useNodeFetchFetcher": true
```

Connecting to https://api.github.com:
- DNS ipv4 Lookup: 140.82.121.6 (2 ms)
- DNS ipv6 Lookup: Error (5 ms): getaddrinfo ENOTFOUND api.github.com
- Proxy URL: None (1 ms)
- Electron fetch (configured): HTTP 200 (47 ms)
- Node.js https: HTTP 200 (160 ms)
- Node.js fetch: HTTP 200 (46 ms)

Connecting to https://api.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 140.82.112.22 (5 ms)
- DNS ipv6 Lookup: Error (4 ms): getaddrinfo ENOTFOUND api.githubcopilot.com
- Proxy URL: None (7 ms)
- Electron fetch (configured): HTTP 200 (399 ms)
- Node.js https: HTTP 200 (424 ms)
- Node.js fetch: HTTP 200 (418 ms)

Connecting to https://copilot-proxy.githubusercontent.com/_ping:
- DNS ipv4 Lookup: 20.199.39.224 (8 ms)
- DNS ipv6 Lookup: Error (5 ms): getaddrinfo ENOTFOUND copilot-proxy.githubusercontent.com
- Proxy URL: None (6 ms)
- Electron fetch (configured): HTTP 200 (197 ms)
- Node.js https: HTTP 200 (203 ms)
- Node.js fetch: HTTP 200 (215 ms)

Connecting to https://mobile.events.data.microsoft.com: HTTP 404 (257 ms)
Connecting to https://dc.services.visualstudio.com: HTTP 404 (274 ms)
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: HTTP 200 (440 ms)
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: HTTP 200 (434 ms)
Connecting to https://default.exp-tas.com: HTTP 400 (149 ms)

Number of system certificates: 352

## Documentation

In corporate networks: [Troubleshooting firewall settings for GitHub Copilot](https://docs.github.com/en/copilot/troubleshooting-github-copilot/troubleshooting-firewall-settings-for-github-copilot).

console.log("SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL)o
