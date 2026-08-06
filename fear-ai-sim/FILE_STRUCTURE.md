# FearDataGen v2.0 - File Structure

## Core Modules (14 files)

### Data Collection
- `seedmanager.js` - Deterministic RNG with seeds
- `trajectorybuffer.js` - Memory-efficient circular buffers
- `fastperception.js` - Spatial perception queries
- `feardatacollector.js` - Main data collection engine

### Processing & Labeling  
- `trajectorylabeler.js` - ML label generation (actions, outcomes, scenarios)
- `trajectoryvalidator.js` - Data quality validation
- `featureengineer.js` - 50+ normalized features

### Export & Analysis
- `dataexporter.js` - Multi-format export (JSONL, CSV, NPY)
- `autobalancer.js` - Automatic dataset balancing
- `datadashboard.js` - Real-time dashboard

### Testing & Validation
- `statehasher.js` - Deterministic state hashing
- `determinism-tests.js` - Comprehensive test suite
- `feardatagen-debug.js` - Debug utilities

### Main Integration
- `feardatagen.js` - Main coordinator class
- `simulation-integration.js` - Easy integration helpers
- `index.js` - Single entry point for all exports

## Desktop App (Tauri)

### Rust Backend
- `src-tauri/src/main.rs` - Rust commands (file export, RNG, validation)
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/tauri.conf.json` - App configuration
- `src-tauri/capabilities/default.json` - File system permissions

### JS Bridge
- `tauri-bridge.js` - JS/Rust communication
- `headless-mode.js` - Batch testing without UI

## Documentation
- `FEARDATAGEN_COMPLETE.md` - Full feature documentation
- `DESKTOP_APP_README.md` - Desktop app setup guide
- `FEARDATAGEN_README.md` - Core system documentation

## Total: 21 files

## Quick Import

```javascript
// Import everything
import { FearDataGen, initDataCollection } from './index.js';

// Or specific modules
import { FearDataGen } from './feardatagen.js';
import { TauriExporter, isTauri } from './tauri-bridge.js';
import { HeadlessFearTester } from './headless-mode.js';
```

## Usage Patterns

### 1. Browser/Basic
```javascript
import { FearDataGen } from './index.js';
const dataGen = new FearDataGen(simulation);
dataGen.initialize(12345, 67890);
```

### 2. Desktop App
```javascript
import { FearDataGen, isTauri, getTauriExporter } from './index.js';
const dataGen = new FearDataGen(simulation, {
    enableBalancer: true,
    enableDashboard: true
});
await dataGen.initialize(12345, 67890);
// Desktop features auto-enabled if running in Tauri
```

### 3. Headless/Batch
```javascript
import { HeadlessFearTester } from './index.js';
const tester = new HeadlessFearTester(simulation, {
    targetTrajectories: 1000
});
await tester.initialize(12345, 67890);
const results = await tester.run();
```

## Build Commands

```bash
# Browser development
npm run dev

# Desktop development  
npm run tauri:dev

# Desktop release build
npm run tauri:build
```

## Dependencies

### JS
- seedrandom (already installed)
- @tauri-apps/api (already installed)

### Rust (auto-installed via cargo)
- tauri
- rand + rand_chacha (deterministic RNG)
- csv (CSV export)
- zip (compression)
- chrono (timestamps)
