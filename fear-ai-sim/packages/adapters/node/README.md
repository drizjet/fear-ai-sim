> Middleware client. Start the server with `npm run server` in the JS repo. Map: `docs/SYSTEM_MAP.md`.

# Fear AI - Node.js ES Module Client Adapter

> [!NOTE]
> **Verification Gate Status**: `ADAPTER_CONFORMANCE (NODE_V20+ runner)`
> *Host Environment Notice: The current evidence covers the protocol/client shape and loopback middleware probes. It does not certify an arbitrary external game runtime or universal latency.*

This client provides WebSocket and HTTP REST connectivity for Node.js / JavaScript game runtimes, Electron games, test harnesses, and simulation servers.

## Features
- **WebSocket Streaming**: Uses the `ws` library for full-duplex game-loop transport; observed latency depends on the host process and loopback environment.
- **Request/Response Correlation**: Matches server responses via message IDs (`id` / `message_id`).
- **Full Wire Protocol Coverage**: Handshake, agent registration, batch observation streaming, snapshot persistence.

## Usage

```javascript
import { FearAIClient } from './fear_ai_client.mjs';

const client = new FearAIClient({ wsUrl: 'ws://127.0.0.1:8765' });
await client.connect();
await client.handshake('NodeGame');

await client.registerAgent('npc_1', { neuroticism: 0.7 });

const res = await client.tick([
  {
    agent_id: 'npc_1',
    x: 0, y: 0, z: 0,
    threats: [{ type: 'PREDATOR', distance: 10, intensity: 0.8 }]
  }
], 0.016);

console.log(res.results[0]);
await client.disconnect();
```
