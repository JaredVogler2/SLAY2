# PROMPT 08 — OPTIONAL LOCAL STS2 OBSERVATION BRIDGE, SECURE & READ-ONLY

Optional convenience, NOT dependency. Assess native Godot/C# STS2 modding, STS2MCP (MIT, tested 0.103.2), BMingSY/sts2-ai-mcp decision protocol and other licensed read-only interfaces. The website must never claim STS2 has an official public game-state API. Integration requires a legit local Steam copy and explicit player consent.

## Task
Provide effortless state updates from a user-owned running game without exposing secrets/future information and without allowing an arbitrary website to control the game.

### Rights and compatibility
Audit mod license, game version, mono/.NET compatibility, Godot model versions, support for macOS/Linux/Windows and official patch status before selecting. Prefer independent read-only sanitizer/bridge that never calls source mod's gameplay mutation APIs, or wrap a restricted client under license. No distribution of the game executable, PCK, original assets, decompiled code or proprietary binaries. Only user-visible state exported; no player auto-play in public ranked/co-op by default.

### Zero-trust localhost
Host bind exclusively to 127.0.0.1/loopback, never accessible to LAN/public. Authenticate browser pairing via unpredictable short-lived one-time token, exact Origin/Host allowlist, CORS and CSRF protections, DNS rebinding defense, rate and payload limits, strict JSON schema and content security. An arbitrary malicious website MUST NOT be able to read state by calling localhost. Account for secure public HTTPS site accessing local HTTP mixed content and evolving Private Network Access requirements; test major browsers. Consider a user-initiated local export/import or extension if direct site calls cannot be secured cross-browser.

### Feature flow
1. /connect explains platform/game build requirements, what it sees, what it will transmit and what it NEVER sees (hidden future) and optional manual alternative.
2. User explicitly installs/runs bridge using authorized mod instructions, pairs with short-lived token.
3. Read local mod state, allowlist only player-visible fields, remove RNG seed/internal draw order/hidden next rewards/unseen map, private system paths/steam ID/private teammate data; labeled observation confidence.
4. Web run command center updates character/deck/relic/Ancient/HP/potions/known map/visible enemy intents/legal current choices. No actions sent to game in v1; recommendations only for human.
5. User can disconnect, revoke token and clear states; staleness warning after game patch/incompatibility, no silent schema mismatch.
6. Co-op state sharing only with party consent/privacy, and no assumption all teammate hands are visible.

### Tests
Malicious Host/Origin, forged/malformed payload, token replay, oversized body, disconnect/reconnect, mid-turn/shuffle, save/load, all five chars when claimed, first-run scripted, version mismatch, browser PNA and no-network, browser private mode. Counterfactual hidden information must be scrubbed. Manual mode always works if bridge unavailable.

### Gate
Actual local bridge only if verified with licensed artifacts and real game; else write clear user-controlled import procedure and mark experimental. Commit docs/code/tests and continue phase 09.
