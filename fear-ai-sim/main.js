import { Simulation } from './simulation.js';
import { MobileOptimizer } from './mobile.js';

/**
 * Integrated Terminal Logger (T13 refinement)
 * Must be defined first to capture early system logs.
 */
const simLogs = document.getElementById('sim-logs');
const btnClearTerminal = document.getElementById('btn-clear-terminal');

export function addLog(message, type = 'info') {
    if (!simLogs) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] [${type.toUpperCase()}]: ${message}`;
    simLogs.appendChild(entry);
    simLogs.scrollTop = simLogs.scrollHeight;
    
    if (simLogs.children.length > 50) {
        simLogs.removeChild(simLogs.firstChild);
    }
}

// Redirect console to in-app terminal for visibility
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Capture all logs for export
window.__capturedLogs = [];
const MAX_CAPTURED_LOGS = 500;

function captureLog(level, args) {
    const timestamp = new Date().toISOString();
    window.__capturedLogs.push({timestamp, level, message: args.join(' ')});
    if (window.__capturedLogs.length > MAX_CAPTURED_LOGS) {
        window.__capturedLogs.shift();
    }
}

console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    captureLog('info', args);
    addLog(args.join(' '), 'info');
};

console.error = function(...args) {
    originalConsoleError.apply(console, args);
    captureLog('error', args);
    addLog(args.join(' '), 'error');
};

// Export logs function
window.exportLogs = function() {
    const blob = new Blob([JSON.stringify(window.__capturedLogs, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${Date.now()}.json`;
    a.click();
    console.log('Logs exported!');
};

// Enhanced error handling to capture stack traces
window.addEventListener('error', (e) => {
    const stack = e.error?.stack || 'No stack trace';
    const msg = `RUNTIME_ERROR: ${e.message}\nStack: ${stack}`;
    addLog(msg, 'error');
    originalConsoleError('Full error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    const stack = e.reason?.stack || 'No stack trace';
    const msg = `UNHANDLED_PROMISE: ${e.reason}\nStack: ${stack}`;
    addLog(msg, 'error');
    originalConsoleError('Unhandled rejection:', e.reason);
});

// Keyboard shortcut to export logs (Ctrl+Shift+L)
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        window.exportLogs();
    }
});

btnClearTerminal?.addEventListener('click', () => {
    if (simLogs) simLogs.innerHTML = '';
});

const canvas = document.getElementById('sim-canvas');
const popCountEl = document.getElementById('pop-count');
const genCountEl = document.getElementById('gen-count');
const avgFearEl = document.getElementById('avg-fear');
const avgSkillEl = document.getElementById('avg-skill');
const mttkStatEl = document.getElementById('mttk-stat');
const activeStressEl = document.getElementById('active-stress-stat');
const panicChainsEl = document.getElementById('panic-chains-stat');
const fpsCounterEl = document.getElementById('fps-counter');
const aiLearningEl = document.getElementById('ai-learning-stat'); // AI Learning stats

// Analytics elements
const analyticsCanvas = document.getElementById('analytics-chart');
const analyticsCtx = analyticsCanvas.getContext('2d');
const exportBtn = document.getElementById('btn-export-json');
const clearDataBtn = document.getElementById('btn-clear-data');

// Controls
const spawnRateInp = document.getElementById('spawn-rate');
const mutationRateInp = document.getElementById('mutation-rate');
const fearInfluenceInp = document.getElementById('fear-influence');
const pheromoneDecayInp = document.getElementById('pheromone-decay');
const soundEnabledInp = document.getElementById('sound-enabled');
const networkVizInp = document.getElementById('network-viz');
const lowPowerModeInp = document.getElementById('low-power-mode');
const resetBtn = document.getElementById('reset-sim');
const addBigGuyBtn = document.getElementById('add-big-guy');
const addStalkerBtn = document.getElementById('add-stalker');
const addSwarmerBtn = document.getElementById('add-swarmer');
const stormBtn = document.getElementById('btn-storm');
const resourceBoomBtn = document.getElementById('btn-resource-boom');
const quarantineBtn = document.getElementById('btn-quarantine');
const saveBtn = document.getElementById('btn-save');
const loadBtn = document.getElementById('btn-load');
const exportReplayBtn = document.getElementById('btn-export-replay');
const inspectorContent = document.getElementById('inspector-content');

// Tactical Overlays (T14 refinement)
const thermalToggle = document.getElementById('thermal-toggle');
const fowToggle = document.getElementById('fow-toggle');

// Phase 10/11: Omniverse Controls
const viewModeSelect = document.getElementById('view-mode');
const genWorldBtn = document.getElementById('btn-gen-world');
const biomeInfoEl = document.getElementById('biome-info');

// Live Scaling & Patching (T13 refinement)
const popSlider = document.getElementById('pop-slider');
const popSliderVal = document.getElementById('pop-slider-val');
const liveFixInp = document.getElementById('live-fix-input');

// Manual Threat Buttons (Phase 10/11)
const spawnTankBtn = document.getElementById('btn-spawn-tank');
const spawnStalkerBtn = document.getElementById('btn-spawn-stalker');
const spawnSwarmBtn = document.getElementById('btn-spawn-swarm');
const clearThreatsBtn = document.getElementById('btn-clear-threats');
const startAudioBtn = document.getElementById('btn-start-audio');

let selectedAgent = null;

// Initialize Config
const config = {
    spawnRate: parseInt(spawnRateInp?.value || 10),
    mutationRate: parseInt(mutationRateInp?.value || 5),
    fearInfluence: parseInt(fearInfluenceInp?.value || 50),
    pheromoneDecay: parseInt(pheromoneDecayInp?.value || 99),
    soundEnabled: soundEnabledInp?.checked ?? true,
    networkViz: networkVizInp?.checked ?? false,
    initialPopulation: 500,
    renderGlows: true,
    renderShadows: true,
    particleEffects: true,
    metricsInterval: 60,
    saveInterval: 300
};

// Setup Canvas size first WITHOUT accessing sim
function resizeCanvasOnly() {
    if (!canvas || !canvas.parentElement) return;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    let width = rect.width || window.innerWidth - 340;
    let height = rect.height || window.innerHeight - 70;
    
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

// CRITICAL: Resize canvas BEFORE creating simulation so agents spawn correctly
resizeCanvasOnly();
console.log('[DEBUG] Canvas after resize:', canvas.width, 'x', canvas.height);

// Initialize Simulation
const sim = new Simulation(canvas, config);
console.log('[DEBUG] Simulation created, agents:', sim.agents.length);

async function startSystem() {
    // Initialize High-Performance PIXI WebGL renderer
    await sim.initPixi();

    // Apply Mobile Optimizations (T5.8)
    if (MobileOptimizer.isMobile()) {
        MobileOptimizer.apply(sim);
        addLog('Mobile device detected. Performance optimizations applied.', 'system');
    }

    // Force handleResize to ensure all systems have correct dimensions
    sim.handleResize();
    addLog(`Canvas: ${canvas.width}x${canvas.height}`, 'system');
    addLog(`Agents: ${sim.agents.length}`, 'system');

    // Initial Boot Sequence
    addLog('Booting Fear AI Omniverse (Software Mode)...', 'system');
    addLog(`Viewport: ${canvas.width}x${canvas.height}`, 'system');

    loop();
}

// Start everything
startSystem();

// Modern Layout Observer (T13 refinement) - Setup AFTER sim is created
const resizeObserver = new ResizeObserver(() => {
    resize();
});
if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

window.addEventListener('resize', resize);

// Event Listeners for Omniverse
viewModeSelect?.addEventListener('change', (e) => {
    sim.toggleViewMode(e.target.value);
    addLog(`View mode changed to ${e.target.value}`, 'system');
});

thermalToggle?.addEventListener('change', (e) => {
    sim.isThermalVision = e.target.checked;
    addLog(`Thermal Vision: ${sim.isThermalVision ? 'ON' : 'OFF'}`, 'system');
});

fowToggle?.addEventListener('change', (e) => {
    sim.config.fowEnabled = e.target.checked;
    addLog(`Fog of War: ${sim.config.fowEnabled ? 'ON' : 'OFF'}`, 'system');
});

genWorldBtn?.addEventListener('click', () => {
    sim.worldEnv.generate();
    sim.navMesh.buildFromObstacles(sim.obstacles);
    addLog('Procedural world regenerated.', 'system');
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (sim.worldEnv && biomeInfoEl) {
        const biome = sim.worldEnv.getBiomeAt(x, y);
        biomeInfoEl.textContent = `Biome: ${biome.name} (Fear x${biome.fearMult}, Cost x${biome.cost})`;
    }
});

// Setup Canvas size - called AFTER sim is initialized
function resize() {
    if (!canvas || !canvas.parentElement) return;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    let width = rect.width;
    let height = rect.height;
    
    // Fallback: if parent has no size yet, use window dimensions minus header
    if (width === 0 || height === 0) {
        width = window.innerWidth - 340; // Subtract sidebar width
        height = window.innerHeight - 70; // Subtract header height
    }
    
    // Only resize if dimensions actually changed
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    
    // Update simulation logical bounds (sim is guaranteed to exist now)
    if (sim && sim.handleResize) {
        sim.handleResize();
    }
}

// Selection logic
let isSelecting = false;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (sim.viewMode === 'RTS') {
        if (e.button === 0) { // Left click
            isSelecting = true;
            sim.startSelection(x, y);
        } else if (e.button === 2) { // Right click
            sim.issueCommand(x, y);
            addLog(`Command: Move to ${Math.round(x)}, ${Math.round(y)}`, 'system');
        }
    } else {
        selectedAgent = sim.selectAgent(x, y);
        if (selectedAgent) {
            addLog(`Inspecting unit at [${Math.floor(x)}, ${Math.floor(y)}]`, 'info');
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isSelecting) {
        sim.updateSelection(x, y);
    }
});

canvas.addEventListener('mouseup', () => {
    if (isSelecting) {
        sim.endSelection();
        isSelecting = false;
        if (sim.selectedAgents.size > 0) {
            addLog(`Selected ${sim.selectedAgents.size} units.`, 'info');
        }
    }
});

canvas.addEventListener('contextmenu', (e) => {
    if (sim.viewMode === 'RTS') e.preventDefault();
});

// Parameter change listeners
spawnRateInp?.addEventListener('change', (e) => sim.config.spawnRate = parseInt(e.target.value));
mutationRateInp?.addEventListener('change', (e) => sim.config.mutationRate = parseInt(e.target.value));
fearInfluenceInp?.addEventListener('change', (e) => sim.config.fearInfluence = parseInt(e.target.value));
pheromoneDecayInp?.addEventListener('change', (e) => sim.pheromoneSystem.decayRate = parseInt(e.target.value) / 100);
soundEnabledInp?.addEventListener('change', (e) => sim.config.soundEnabled = e.target.checked);
networkVizInp?.addEventListener('change', (e) => sim.config.networkViz = e.target.checked);

lowPowerModeInp?.addEventListener('change', (e) => {
    const mode = e.target.checked ? 'LOW_POWER' : 'HIGH_PERFORMANCE';
    MobileOptimizer.setPowerMode(sim, mode);
    addLog(`Power Mode: ${mode}`, 'system');
});

resetBtn.addEventListener('click', () => {
    sim.reset();
    addLog('Simulation reset sequence initiated.', 'system');
});

addBigGuyBtn.addEventListener('click', () => sim.addPredator('TANK'));
addStalkerBtn.addEventListener('click', () => sim.addPredator('STALKER'));
addSwarmerBtn.addEventListener('click', () => sim.spawnSwarm(5));

stormBtn?.addEventListener('click', () => {
    sim.triggerStorm();
    addLog('Atmospheric storm event triggered.', 'threat');
});

resourceBoomBtn?.addEventListener('click', () => {
    sim.triggerResourceBoom();
    addLog('Resource surge detected.', 'info');
});

quarantineBtn?.addEventListener('click', () => {
    sim.triggerQuarantine();
    addLog('Biological containment initiated.', 'threat');
});

saveBtn?.addEventListener('click', () => {
    sim.save();
    addLog('World state cached to local storage.', 'system');
});

loadBtn?.addEventListener('click', () => {
    if (sim.load()) {
        addLog('World state restored.', 'system');
    }
});

exportBtn?.addEventListener('click', () => {
    const data = sim.metricsCollector.exportMetrics();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fear-ai-metrics-${Date.now()}.json`;
    a.click();
    addLog('Metrics exported successfully.', 'info');
});

// Export AI Learning Data
const exportLearningBtn = document.getElementById('btn-export-learning');
exportLearningBtn?.addEventListener('click', () => {
    import('./predator.js').then(({ PredatorLearning }) => {
        const data = PredatorLearning.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `predator-ai-learning-${Date.now()}.json`;
        a.click();
        addLog('AI Learning data exported.', 'info');
    });
});

// Reset AI Learning
const resetLearningBtn = document.getElementById('btn-reset-learning');
resetLearningBtn?.addEventListener('click', () => {
    Promise.all([
        import('./predator.js'),
        import('./learningagent.js')
    ]).then(([{ PredatorLearning }, { AgentLearning }]) => {
        PredatorLearning.reset();
        AgentLearning.reset();
        addLog('AI Learning data reset. Both systems will start fresh.', 'system');
    });
});

// Export Prey Learning Data
const exportPreyLearningBtn = document.getElementById('btn-export-prey-learning');
exportPreyLearningBtn?.addEventListener('click', () => {
    import('./learningagent.js').then(({ AgentLearning }) => {
        const data = AgentLearning.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prey-ai-learning-${Date.now()}.json`;
        a.click();
        addLog('Prey AI Learning data exported.', 'info');
    });
});

// Update AI Learning stats display
let lastPredatorData = null;
let lastPreyData = null;
function updateAILearningStats() {
    if (!aiLearningEl || sim.frameCount % 60 !== 0) return; // Update every 60 frames
    
    Promise.all([
        import('./predator.js').catch(() => null),
        import('./learningagent.js').catch(() => null)
    ]).then(([predatorModule, preyModule]) => {
        if (predatorModule && preyModule) {
            const predatorData = predatorModule.PredatorLearning.exportData();
            const preyData = preyModule.AgentLearning.exportData();
            
            // Only update if data changed
            const predKills = predatorData.huntStats.successfulPursuits;
            const preyEscapes = preyData.survivalStats.totalEscapes;
            
            if (!lastPredatorData || lastPredatorData.huntStats.successfulPursuits !== predKills ||
                !lastPreyData || lastPreyData.survivalStats.totalEscapes !== preyEscapes) {
                
                lastPredatorData = predatorData;
                lastPreyData = preyData;
                
                const killRate = (predatorData.huntStats.successRate * 100).toFixed(0);
                const escapeRate = parseFloat(preyData.survivalStats.survivalRate).toFixed(0);
                
                // Show competition: P=kills vs E=escapes
                aiLearningEl.textContent = `P:${predKills}(${killRate}%) vs E:${preyEscapes}(${escapeRate}%)`;
                
                // Color based on who's winning
                if (parseFloat(killRate) > 60) {
                    aiLearningEl.style.color = '#ff5555'; // Predators winning
                } else if (parseFloat(escapeRate) > 60) {
                    aiLearningEl.style.color = '#55ff55'; // Prey winning
                } else {
                    aiLearningEl.style.color = '#d800ff'; // Balanced
                }
            }
        }
    });
}

clearDataBtn?.addEventListener('click', () => {
    if (confirm('Clear all analytics data?')) {
        sim.metricsCollector.reset();
        addLog('Analytics data cleared.', 'system');
    }
});

// Event Listeners for Manual Threat Deployment
spawnTankBtn?.addEventListener('click', () => {
    sim.addPredator('TANK');
    addLog('Manual Deployment: TANK', 'system');
});

spawnStalkerBtn?.addEventListener('click', () => {
    sim.addPredator('STALKER');
    addLog('Manual Deployment: STALKER', 'system');
});

spawnSwarmBtn?.addEventListener('click', () => {
    sim.spawnSwarm(5);
    addLog('Manual Deployment: SWARM PACK (5)', 'system');
});

clearThreatsBtn?.addEventListener('click', () => {
    sim.predators = [];
    addLog('Threat clearance sequence complete.', 'system');
});

startAudioBtn?.addEventListener('click', () => {
    if (sim.audioEngine) {
        sim.audioEngine.init();
        addLog('Affective Audio Engine started.', 'system');
        startAudioBtn.disabled = true;
        startAudioBtn.textContent = '🎵 Audio Active';
    }
});

// Live Population Scaling (T13 refinement)
popSlider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (popSliderVal) popSliderVal.textContent = val;
});

popSlider?.addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    sim.setPopulation(val);
    addLog(`Live Population Scale: ${val} agents`, 'system');
});

// Live Hot-Fix System (T13 refinement)
liveFixInp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const code = e.target.value;
        try {
            // Hot-patch the simulation instance
            const result = eval(code);
            addLog(`LIVE_FIX SUCCESS: ${code}`, 'system');
            if (result !== undefined) console.log('[PATCH RESULT]', result);
            e.target.value = '';
        } catch (err) {
            addLog(`LIVE_FIX FAILED: ${err.message}`, 'error');
        }
    }
});

function renderAnalytics() {
    const ctx = analyticsCtx;
    const w = analyticsCanvas.width;
    const h = analyticsCanvas.height;
    ctx.clearRect(0, 0, w, h);
    
    // Draw population/fear trend
    const history = sim.analytics.history.population;
    if (history.length < 2) return;
    
    ctx.beginPath();
    ctx.strokeStyle = '#00f2ff';
    ctx.lineWidth = 2;
    const maxVal = Math.max(...history, 2000);
    history.forEach((val, i) => {
        const x = (i / (history.length - 1)) * w;
        const y = h - (val / maxVal) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function updateInspector() {
    if (!selectedAgent) return;
    
    if (selectedAgent.dead) {
        inspectorContent.innerHTML = `<div class="log-entry threat">UNIT TERMINATED</div>`;
        selectedAgent = null;
        return;
    }

    inspectorContent.innerHTML = `
        <div class="agent-stats">
            <div class="stat-row"><span>State</span> <span class="val">${selectedAgent.brain.state}</span></div>
            <div class="stat-row"><span>Tribe</span> <span class="val">${selectedAgent.familyName}</span></div>
            
            <div class="viz-block">
                <label>Fear Level</label>
                <div class="bar-bg"><div class="bar-fill" style="width: ${selectedAgent.brain.currentFear * 100}%; background: #ff3333;"></div></div>
            </div>
            <div class="viz-block">
                <label>Energy</label>
                <div class="bar-bg"><div class="bar-fill" style="width: ${selectedAgent.energy}%; background: #00ff88;"></div></div>
            </div>
            
            <div class="viz-block" style="margin-top: 12px; border-top: 1px solid rgba(0,255,100,0.3); padding-top: 8px;">
                <label style="color: #00ff88;">👤 Lineage</label>
                <div style="font-size: 0.75rem; color: var(--text-dim);">
                    <div>Family: <span style="color: #00ff88;">${selectedAgent.familyName}</span></div>
                    <div>ID: #${selectedAgent.id} | Gen: ${selectedAgent.generation}</div>
                </div>
            </div>
        </div>
    `;
}

let lastGen = 1;

// ==================== MASAC Deep RL Integration ====================

// MASAC UI Elements
const masacStatusText = document.getElementById('masac-status-text');
const masacStepsEl = document.getElementById('masac-steps');
const masacPredAlphaEl = document.getElementById('masac-pred-alpha');
const masacPreyAlphaEl = document.getElementById('masac-prey-alpha');
const masacPredLossEl = document.getElementById('masac-pred-loss');
const masacPreyLossEl = document.getElementById('masac-prey-loss');
const btnMasacInit = document.getElementById('btn-masac-init');
const btnMasacToggle = document.getElementById('btn-masac-toggle');
const btnExportMasac = document.getElementById('btn-export-masac');
const btnSaveModels = document.getElementById('btn-save-models');

function updateMASACUI() {
    if (!sim?.masacIntegration) {
        if (masacStatusText) {
            masacStatusText.textContent = 'Inactive';
            masacStatusText.className = 'status-inactive';
        }
        return;
    }
    
    const metrics = sim.getMASACMetrics();
    if (!metrics) return;
    
    if (masacStepsEl) masacStepsEl.textContent = metrics.step?.toLocaleString() || '0';
    
    if (metrics.predator) {
        if (masacPredAlphaEl) masacPredAlphaEl.textContent = metrics.predator.avgEpsilon?.toFixed(3) || '0.300';
        if (masacPredLossEl) masacPredLossEl.textContent = metrics.predator.avgReward?.toFixed(3) || '--';
    }
    
    if (metrics.prey) {
        if (masacPreyAlphaEl) masacPreyAlphaEl.textContent = metrics.prey.avgEpsilon?.toFixed(3) || '0.300';
        if (masacPreyLossEl) masacPreyLossEl.textContent = metrics.prey.avgReward?.toFixed(3) || '--';
    }
    
    // Show co-evolution metrics if available
    if (metrics.coevolution) {
        addLog(`[MASAC] Kill Rate: ${metrics.coevolution.killRate}, ` +
               `Predator R: ${metrics.coevolution.predatorAvgReward}, ` +
               `Prey R: ${metrics.coevolution.preyAvgReward}`, 'debug');
    }
    
    // Update status
    if (masacStatusText) {
        if (sim.masacIntegration.enabled) {
            masacStatusText.textContent = sim.masacIntegration.trainingPaused ? 'Paused' : 'Active';
            masacStatusText.className = sim.masacIntegration.trainingPaused ? 'status-paused' : 'status-active';
        } else {
            masacStatusText.textContent = 'Inactive';
            masacStatusText.className = 'status-inactive';
        }
    }
}

// Initialize MASAC
btnMasacInit?.addEventListener('click', () => {
    try {
        if (!sim) {
            addLog('Simulation not ready!', 'error');
            return;
        }
        
        const success = sim.initializeMASAC();
        if (!success) {
            addLog('MASAC already initialized', 'info');
            return;
        }
        
        if (btnMasacToggle) btnMasacToggle.disabled = false;
        if (btnMasacInit) {
            btnMasacInit.textContent = 'MASAC Active';
            btnMasacInit.disabled = true;
        }
        
        addLog('MASAC Deep RL initialized!', 'system');
        addLog(`Predators: ${sim.predators.length}, Prey: ${sim.agents.length}`, 'info');
        updateMASACUI();
    } catch (err) {
        addLog(`MASAC Init Error: ${err.message}`, 'error');
        console.error(err);
    }
});

// Toggle training
btnMasacToggle?.addEventListener('click', () => {
    if (!sim?.masacIntegration) return;
    
    sim.masacIntegration.trainingPaused = !sim.masacIntegration.trainingPaused;
    btnMasacToggle.textContent = sim.masacIntegration.trainingPaused ? 'Resume Training' : 'Pause Training';
    addLog(`Training ${sim.masacIntegration.trainingPaused ? 'paused' : 'resumed'}`, 'info');
    updateMASACUI();
});

// Export MASAC research data
btnExportMasac?.addEventListener('click', () => {
    const data = sim?.exportMASACData();
    if (!data) {
        addLog('MASAC not initialized!', 'error');
        return;
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masac-research-${Date.now()}.json`;
    a.click();
    
    addLog('MASAC research data exported!', 'info');
});

// Save models
btnSaveModels?.addEventListener('click', async () => {
    const models = await sim?.saveMASACModels();
    if (!models) {
        addLog('MASAC not initialized!', 'error');
        return;
    }
    
    const blob = new Blob([JSON.stringify(models, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masac-models-${Date.now()}.json`;
    a.click();
    
    addLog('Trained models saved!', 'info');
});

// Phase 2: High-Speed Data Bridge Toggle
const btnToggleBridge = document.getElementById('btn-toggle-bridge');
btnToggleBridge?.addEventListener('click', async () => {
    if (!sim || !sim.dataBridge) return;
    
    if (!sim.dataBridge.active) {
        await sim.startDataLogging('fear_ai_capture');
        if (sim.dataBridge.active) {
            btnToggleBridge.textContent = 'Stop High-Speed Stream';
            btnToggleBridge.style.background = 'linear-gradient(135deg, #ff3333 0%, #ff0055 100%)';
            addLog('Phase 2 Data Bridge: HIGH-SPEED STREAMING ACTIVE', 'system');
        }
    } else {
        await sim.stopDataLogging();
        btnToggleBridge.textContent = 'Start High-Speed Stream';
        btnToggleBridge.style.background = 'linear-gradient(135deg, #0088ff 0%, #00f2ff 100%)';
        addLog('Phase 2 Data Bridge: Streaming stopped and flushed', 'system');
    }
});

// Phase 3: Rust Physics Toggle
const rustPhysicsToggle = document.getElementById('rust-physics-toggle');
const workerPhysicsToggle = document.getElementById('worker-physics-toggle');
const rustEngineStatus = document.getElementById('rust-engine-status');

rustPhysicsToggle?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await sim.toggleRustPhysics(enabled);
    
    // Disable worker toggle if rust is enabled
    if (enabled && workerPhysicsToggle) {
        workerPhysicsToggle.checked = false;
        sim.toggleWorkerPhysics(false);
    }

    if (rustEngineStatus) {
        rustEngineStatus.textContent = enabled ? 
            'Status: RUST HIGH-SPEED ENGINE ACTIVE' : 
            'Status: Using Main Thread Physics';
        rustEngineStatus.style.color = enabled ? '#00ff88' : 'var(--text-dim)';
    }
    
    addLog(`Physics Engine: ${enabled ? 'RUST (High Performance)' : 'JavaScript'}`, 'system');
});

workerPhysicsToggle?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    sim.toggleWorkerPhysics(enabled);

    // Disable rust toggle if worker is enabled
    if (enabled && rustPhysicsToggle) {
        rustPhysicsToggle.checked = false;
        sim.toggleRustPhysics(false);
    }

    if (rustEngineStatus) {
        rustEngineStatus.textContent = enabled ? 
            'Status: PARALLEL CPU CORES ACTIVE' : 
            'Status: Using Main Thread Physics';
        rustEngineStatus.style.color = enabled ? '#0088ff' : 'var(--text-dim)';
    }

    addLog(`Physics Engine: ${enabled ? 'PARALLEL CPU (Multithreaded)' : 'JavaScript'}`, 'system');
});

// Update MASAC UI periodically
setInterval(updateMASACUI, 1000);

// ==================== End MASAC Integration ====================

async function loop() {
    try {
        if (!sim) {
            console.log('[DEBUG] loop: sim is undefined!');
            return;
        }
        
        try {
            await sim.update();
        } catch (err) {
            const stack = err.stack || 'No stack';
            const foodCount = sim.food?.length || 'unknown';
            const agentCount = sim.agents?.length || 'unknown';
            const context = `Food: ${foodCount}, Agents: ${agentCount}, Frame: ${sim.frameCount}`;
            addLog(`SIMULATION_CRASH: ${err.message}\nContext: ${context}\nStack: ${stack}`, 'error');
            originalConsoleError('Simulation crash:', err);
        }
        
        // Debug: log first few frames
        if (sim.frameCount === 1) {
            // First frame fully executed
        }
        
        sim.draw();
        
        // Update Stats
        const stats = sim.getStats();
        if (popCountEl) popCountEl.textContent = stats.count;
        if (genCountEl) genCountEl.textContent = sim.generation;
        if (avgFearEl) avgFearEl.textContent = stats.avgFear;
        
        if (sim.generation > lastGen) {
            lastGen = sim.generation;
            addLog(`Generation ${lastGen} initialized. Survivors evolved.`, 'info');
        }

        renderAnalytics();
        updateInspector();
        updateAILearningStats();
        // Phase 16: Bio-Feedback Shader Scaling
        if (sim.calibration && !sim.calibration.isCalibrating) {
            const stats2 = sim.getStats();
            const arousal = parseFloat(stats2.avgFear);
            const panicRatio = sim.massPanicActive ? 1.0 : 0.0;

            // Calculate dynamic filter values
            const saturation = 100 + (arousal * 150); // 100% to 250%
            const brightness = 100 - (arousal * 40);  // Dims further when scary
            const contrast = 100 + (arousal * 80);    // Much harsher/sharper
            const sepia = panicRatio * 40;            // Stronger sepia during panic

            // Mass Panic "Heartbeat" Pulse
            let redPulse = 0;
            if (sim.massPanicActive) {
                redPulse = Math.sin(Date.now() / 120) * 20 + 20; // Faster 20-40% red glow
            }

            // VISIONARY PILLAR: Glitch Effect at extreme fear
            let glitch = '';
            if (arousal > 0.8) {
                const gx = (Math.random() - 0.5) * 10 * arousal;
                const gy = (Math.random() - 0.5) * 10 * arousal;
                glitch = `translate(${gx}px, ${gy}px) skewX(${(Math.random() - 0.5) * 5}deg)`;

                // Randomly flash red/white for extreme tension
                if (Math.random() > 0.95) {
                    canvas.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                } else {
                    canvas.style.backgroundColor = 'transparent';
                }
            } else {
                canvas.style.backgroundColor = 'transparent';
            }

            canvas.style.filter = `saturate(${saturation}%) brightness(${brightness}%) contrast(${contrast}%) sepia(${sepia}%)`;
            canvas.style.transform = glitch;
            canvas.style.boxShadow = `inset 0 0 ${redPulse}px rgba(255, 0, 0, ${panicRatio * 0.7})`;

            // Apply similar effects to the 3D container if active
            if (sim.viewMode === '3D' && sim.container3D) {
                sim.container3D.style.filter = canvas.style.filter;
                sim.container3D.style.transform = glitch;
            }
        }
    } catch (err) {
        addLog(`LOOP_CRASH: ${err.message}`, 'error');
        console.error(err);
    }
    // Always schedule the next frame, even after an error
    requestAnimationFrame(loop);
}

// Initial Boot Sequence
addLog('Booting Fear AI Omniverse (Software Mode)...', 'system');
addLog(`Viewport: ${canvas.width}x${canvas.height}`, 'system');

// The loop is now started within startSystem()
