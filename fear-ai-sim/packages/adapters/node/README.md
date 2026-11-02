> Middleware client. Start the server with `npm run server` in the JS repo. Map: `docs/SYSTEM_MAP.md`.

# Fear AI - Node.js ES Module Client Adapter

> [!NOTE]
> **Verification Gate Status**: `ADAPTER_CONFORMANCE (NODE_V20+ runner)`
> *Host Environment Notice: The current evidence covers the protocol/client shape and loopback middleware probes. It does not certify an arbitrary external game runtime or universal latency.*

This client provides WebSocket and HTTP REST connectivity for Node.js / JavaScript game runtimes, Electron games, test harnesses, and simulation servers.

## Authenticated local host child-process metadata (separate transport)

For a **trusted Node parent** that owns a `CivilizationSimulationSystem` or
`WorldTradeAuthority`, use `host_ipc_adapter.mjs` rather than forwarding a
raw `child.on('message')` payload into the simulation:

```js
import { spawnAuthenticatedHostChild } from './host_ipc_adapter.mjs';
const session = spawnAuthenticatedHostChild(sim, './owned-host-child.mjs', {
  peerId: 'neutral-host', allowedEventTypes: ['host_signal'],
  allowedEntityIds: ['neutral'],
  maxMessagesPerWindow: 16, windowMs: 1000,
  maxFrameBytes: 16384, maxBytesPerWindow: 65536
});
// On child disconnect/exit it is revoked. For a replacement child, call
// spawnAuthenticatedHostChild again on the same trusted simulator after exit.
// Explicitly close a still-running owned child with session.close().
```

In the **isolated child**:

```js
import { createAuthenticatedHostSender } from './host_ipc_adapter.mjs';
const sender = createAuthenticatedHostSender(process);
process.on('message', () => {
  if (sender.ready) sender.send(
    '{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{}}'
  );
});
```

This path uses a new credential per process launch, signed monotonically
increasing messages, per-peer byte/message quotas and event/entity allowlists.
Do not reuse a prior session after a crash, log credentials or retry an
ambiguous write. **Do not** pass live simulator objects to the child. The
existing `FearAIClient` HTTP/WebSocket API is *not* this IPC transport and
remains unchanged. See `docs/TRUSTED_HOST_TRANSFER.md`.

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
