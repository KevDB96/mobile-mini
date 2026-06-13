Local persist server

This small server allows the browser app to request an automatic update + git commit of `data/tod_prompts.json` when running on your local machine and connected to an allowed Wi-Fi network.

Setup

1. Edit `scripts/persist-config.json`:
   - `allowedSSID`: set to the Wi-Fi SSID name you want to allow (or `null` to disable SSID check).
   - `allowedGatewayMac`: optional MAC address of your router (format: `aa:bb:cc:dd:ee:ff`) — works when the server is wired.
   - `allowedSubnets`: optional array of allowed CIDR ranges (e.g. `["192.168.1.0/24"]`) to allow persistence when the server's IP is in that subnet.
   - `requireLocalOnly`: when true, only accept requests from private/local IPs.
   - `repoPath`: absolute path to your repo (default: `../` from scripts).
   - `token`: a secret token. Copy this to your browser localStorage as `persist_token`.
   - `branch`: the git branch to push to (default `main`).

2. Run the server locally (requires Node.js):

```powershell
node scripts\persist-server.js
```

3. In the browser app's settings, set `persist_token` in devtools console or via a future UI:

```javascript
localStorage.setItem('persist_token', 'replace-with-secret-token');
```

How it works

- When the app would normally persist prompts, it first attempts to POST to `http://127.0.0.1:34000/persist-tod` with the `X-Persist-Token` header.
- The server checks the token and the current Wi-Fi SSID (Windows/Mac/Linux supported heuristics).
- If allowed, the server writes `data/tod_prompts.json` and runs `git add/commit/push` locally.

Security

- The server listens on `127.0.0.1` only and requires `X-Persist-Token`.
- Do not use a trivial token in production; keep the server run only on trusted machines.

Network heuristics

- The server now prefers `allowedSSID` when present (works for wireless).
- If `allowedSSID` is not set, it can check the default gateway's MAC address (`allowedGatewayMac`) — useful when the PC is wired but shares the same router as your phone.
- If neither SSID nor gateway MAC is provided, `allowedSubnets` can be used as a fallback.
- `requireLocalOnly` prevents requests from non-private IPs.

Limitations

- This only persists changes from your local machine. Visitors to the GitHub Pages site cannot trigger commits on your repo.
- Make sure your git config can push to origin without interactive prompts (credential manager or saved credentials).
