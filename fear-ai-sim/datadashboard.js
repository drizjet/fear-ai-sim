/**
 * datadashboard.js - Real-time data collection dashboard
 * Displays statistics, balance info, and trajectory previews
 */

export class DataDashboard {
    constructor(fearDataGen, autoBalancer, containerId = 'data-dashboard') {
        this.dataGen = fearDataGen;
        this.balancer = autoBalancer;
        this.containerId = containerId;
        this.container = null;
        
        // Chart instances
        this.charts = {};
        
        // Update interval
        this.updateInterval = 1000; // 1 second
        this.updateTimer = null;
        
        // History for graphs
        this.history = {
            timestamps: [],
            trajectoryCounts: [],
            eventCounts: [],
            fearLevels: [],
            maxHistory: 60 // 1 minute at 1s updates
        };
    }
    
    /**
     * Initialize dashboard UI
     */
    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            // Create container if doesn't exist
            this.container = document.createElement('div');
            this.container.id = this.containerId;
            document.body.appendChild(this.container);
        }
        
        this._createLayout();
        this._startUpdates();
        
        console.log('[DataDashboard] Initialized');
    }
    
    /**
     * Create dashboard layout
     */
    _createLayout() {
        this.container.innerHTML = `
            <div class="data-dashboard" style="
                position: fixed;
                top: 10px;
                right: 10px;
                width: 400px;
                max-height: 90vh;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.9);
                color: #0f0;
                font-family: monospace;
                font-size: 12px;
                padding: 15px;
                border-radius: 8px;
                border: 1px solid #0f0;
                z-index: 10000;
            ">
                <div class="dashboard-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #0f0;
                    padding-bottom: 10px;
                ">
                    <h3 style="margin: 0; color: #0f0;">🧠 FearDataGen</h3>
                    <button id="dashboard-toggle" style="
                        background: transparent;
                        border: 1px solid #0f0;
                        color: #0f0;
                        cursor: pointer;
                        padding: 2px 8px;
                    ">−</button>
                </div>
                
                <div id="dashboard-content">
                    <!-- Stats Section -->
                    <div class="section" style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: #0ff;">📊 Collection Stats</h4>
                        <div id="stats-content"></div>
                    </div>
                    
                    <!-- Balance Section -->
                    <div class="section" style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: #0ff;">⚖️ Dataset Balance</h4>
                        <div id="balance-content"></div>
                    </div>
                    
                    <!-- Scenario Distribution -->
                    <div class="section" style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: #0ff;">🎯 Scenarios</h4>
                        <div id="scenario-content"></div>
                    </div>
                    
                    <!-- Recent Events -->
                    <div class="section" style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: #0ff;">⚡ Recent Events</h4>
                        <div id="events-content"></div>
                    </div>
                    
                    <!-- Controls -->
                    <div class="section" style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: #0ff;">🎮 Controls</h4>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button id="btn-export" style="
                                background: #0f0;
                                color: #000;
                                border: none;
                                padding: 5px 10px;
                                cursor: pointer;
                                font-family: monospace;
                                font-weight: bold;
                            ">📥 Export Data</button>
                            <button id="btn-clear" style="
                                background: #f00;
                                color: #fff;
                                border: none;
                                padding: 5px 10px;
                                cursor: pointer;
                                font-family: monospace;
                            ">🗑️ Clear</button>
                            <button id="btn-sample" style="
                                background: #00f;
                                color: #fff;
                                border: none;
                                padding: 5px 10px;
                                cursor: pointer;
                                font-family: monospace;
                            ">👁️ View Sample</button>
                        </div>
                    </div>
                    
                    <!-- Mini Graph -->
                    <div class="section">
                        <h4 style="margin: 0 0 8px 0; color: #0ff;">📈 Collection Rate</h4>
                        <canvas id="rate-graph" width="370" height="80" style="
                            background: rgba(0, 50, 0, 0.3);
                            border: 1px solid #0f0;
                        "></canvas>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        this._addStyles();
        
        // Bind events
        this._bindEvents();
    }
    
    /**
     * Add CSS styles
     */
    _addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .data-dashboard .stat-row {
                display: flex;
                justify-content: space-between;
                padding: 3px 0;
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
            }
            .data-dashboard .stat-label {
                color: #888;
            }
            .data-dashboard .stat-value {
                color: #0f0;
                font-weight: bold;
            }
            .data-dashboard .scenario-bar {
                display: flex;
                align-items: center;
                margin: 4px 0;
            }
            .data-dashboard .scenario-name {
                width: 100px;
                color: #888;
                font-size: 10px;
            }
            .data-dashboard .scenario-progress {
                flex: 1;
                height: 12px;
                background: rgba(0, 50, 0, 0.5);
                border: 1px solid #0f0;
                margin: 0 8px;
                position: relative;
            }
            .data-dashboard .scenario-fill {
                height: 100%;
                background: linear-gradient(90deg, #0f0, #0ff);
                transition: width 0.3s;
            }
            .data-dashboard .scenario-count {
                width: 40px;
                text-align: right;
                color: #0f0;
                font-size: 10px;
            }
            .data-dashboard .event-item {
                padding: 4px 0;
                border-bottom: 1px solid rgba(0, 255, 0, 0.1);
                font-size: 11px;
            }
            .data-dashboard .collapsed {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Bind event handlers
     */
    _bindEvents() {
        // Toggle button
        const toggleBtn = document.getElementById('dashboard-toggle');
        const content = document.getElementById('dashboard-content');
        let collapsed = false;
        
        toggleBtn?.addEventListener('click', () => {
            collapsed = !collapsed;
            content.classList.toggle('collapsed', collapsed);
            toggleBtn.textContent = collapsed ? '+' : '−';
        });
        
        // Export button
        document.getElementById('btn-export')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-export');
            btn.textContent = '⏳ Exporting...';
            btn.disabled = true;
            
            try {
                const result = await this.dataGen.export();
                btn.textContent = '✅ Exported!';
                setTimeout(() => {
                    btn.textContent = '📥 Export Data';
                    btn.disabled = false;
                }, 2000);
            } catch (error) {
                btn.textContent = '❌ Error';
                console.error('Export failed:', error);
                setTimeout(() => {
                    btn.textContent = '📥 Export Data';
                    btn.disabled = false;
                }, 2000);
            }
        });
        
        // Clear button
        document.getElementById('btn-clear')?.addEventListener('click', () => {
            if (confirm('Clear all collected data?')) {
                this.dataGen.clear();
                this.history.timestamps = [];
                this.history.trajectoryCounts = [];
            }
        });
        
        // Sample button
        document.getElementById('btn-sample')?.addEventListener('click', () => {
            this._showSampleTrajectory();
        });
    }
    
    /**
     * Start periodic updates
     */
    _startUpdates() {
        this.updateTimer = setInterval(() => {
            this._update();
        }, this.updateInterval);
    }
    
    /**
     * Update dashboard content
     */
    _update() {
        if (!this.dataGen) return;
        
        const stats = this.dataGen.getStats();
        const balance = this.dataGen.getBalanceInfo();
        
        // Update history
        this.history.timestamps.push(Date.now());
        this.history.trajectoryCounts.push(stats.storedTrajectories);
        this.history.eventCounts.push(stats.totalEvents);
        
        if (this.history.timestamps.length > this.history.maxHistory) {
            this.history.timestamps.shift();
            this.history.trajectoryCounts.shift();
            this.history.eventCounts.shift();
        }
        
        // Update sections
        this._updateStats(stats);
        this._updateBalance(stats);
        this._updateScenarios(balance);
        this._updateEvents();
        this._updateGraph();
    }
    
    /**
     * Update stats section
     */
    _updateStats(stats) {
        const el = document.getElementById('stats-content');
        if (!el) return;
        
        el.innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Trajectories:</span>
                <span class="stat-value">${stats.storedTrajectories.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Valid:</span>
                <span class="stat-value">${stats.totalValid.toLocaleString()} (${((stats.totalValid / Math.max(1, stats.totalCollected)) * 100).toFixed(1)}%)</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Samples:</span>
                <span class="stat-value">${stats.totalSamples.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Events:</span>
                <span class="stat-value">${stats.totalEvents.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Rate:</span>
                <span class="stat-value">${stats.collectionRate?.toFixed(1) || 0}/min</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Memory:</span>
                <span class="stat-value">${(stats.memoryUsage / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Runtime:</span>
                <span class="stat-value">${(stats.elapsedTime / 60).toFixed(1)} min</span>
            </div>
        `;
    }
    
    /**
     * Update balance section
     */
    _updateBalance(stats) {
        const el = document.getElementById('balance-content');
        if (!el) return;
        
        const balanceScore = this.balancer?.stats?.lastBalanceScore || 0;
        const balancePct = (balanceScore * 100).toFixed(1);
        const balanceColor = balanceScore > 0.85 ? '#0f0' : balanceScore > 0.7 ? '#ff0' : '#f00';
        
        el.innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Balance Score:</span>
                <span class="stat-value" style="color: ${balanceColor}">${balancePct}%</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Adjustments:</span>
                <span class="stat-value">${this.balancer?.stats?.totalAdjustments || 0}</span>
            </div>
        `;
    }
    
    /**
     * Update scenario distribution
     */
    _updateScenarios(balance) {
        const el = document.getElementById('scenario-content');
        if (!el) return;
        
        const total = balance.total || 1;
        const scenarios = balance.scenarios || {};
        
        // Sort by count
        const sorted = Object.entries(scenarios).sort((a, b) => b[1] - a[1]);
        
        el.innerHTML = sorted.map(([name, count]) => {
            const pct = (count / total * 100).toFixed(1);
            return `
                <div class="scenario-bar">
                    <span class="scenario-name">${name}</span>
                    <div class="scenario-progress">
                        <div class="scenario-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="scenario-count">${count}</span>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Update recent events
     */
    _updateEvents() {
        const el = document.getElementById('events-content');
        if (!el) return;
        
        // Get recent trajectories (last 5)
        const recent = this.dataGen.trajectories?.slice(-5) || [];
        
        if (recent.length === 0) {
            el.innerHTML = '<div style="color: #666; font-style: italic;">No events yet...</div>';
            return;
        }
        
        el.innerHTML = recent.map((traj, i) => {
            const labels = this.dataGen.labels[this.dataGen.labels.length - recent.length + i];
            const outcome = labels?.outcome?.survived ? '✓' : '✗';
            const fear = labels?.outcome?.peakFear?.toFixed(2) || '?';
            
            return `
                <div class="event-item">
                    ${outcome} ${traj.eventType} | ${labels?.scenario?.type || '?'} | Peak: ${fear}
                </div>
            `;
        }).join('');
    }
    
    /**
     * Update rate graph
     */
    _updateGraph() {
        const canvas = document.getElementById('rate-graph');
        if (!canvas || this.history.trajectoryCounts.length < 2) return;
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        // Clear
        ctx.fillStyle = 'rgba(0, 50, 0, 0.3)';
        ctx.fillRect(0, 0, w, h);
        
        // Draw grid
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        
        // Draw trajectory count line
        const maxCount = Math.max(...this.history.trajectoryCounts, 10);
        const xStep = w / (this.history.maxHistory - 1);
        
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        this.history.trajectoryCounts.forEach((count, i) => {
            const x = i * xStep;
            const y = h - (count / maxCount) * h * 0.9 - 5;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
        
        // Draw event count line (secondary)
        const maxEvents = Math.max(...this.history.eventCounts, 10);
        
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        this.history.eventCounts.forEach((count, i) => {
            const x = i * xStep;
            const y = h - (count / maxEvents) * h * 0.5 - 5;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
    }
    
    /**
     * Show sample trajectory details
     */
    _showSampleTrajectory() {
        const sample = this.dataGen.getSampleTrajectory(0);
        if (!sample) {
            alert('No trajectories collected yet!');
            return;
        }
        
        const details = `
Trajectory: ${sample.trajectory.id}
Agent: ${sample.trajectory.agentId}
Event: ${sample.trajectory.eventType}
Frames: ${sample.trajectory.frames.length}
Scenario: ${sample.labels?.scenario?.type || '?'}
Outcome: ${sample.labels?.outcome?.survived ? 'Survived' : 'Died'}
Peak Fear: ${sample.labels?.outcome?.peakFear?.toFixed(3)}
Final Fear: ${sample.labels?.outcome?.finalFear?.toFixed(3)}
Flee Quality: ${sample.labels?.actions?.fleeQuality?.toFixed(3)}
Optimal Path: ${sample.labels?.counterfactuals?.optimalPath ? 'Yes' : 'No'}
Quality Score: ${sample.labels?.quality?.labelConfidence?.toFixed(3)}
        `.trim();
        
        console.log('Sample Trajectory:', sample);
        alert(details);
    }
    
    /**
     * Destroy dashboard
     */
    destroy() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}

/**
 * Simple console-based dashboard for headless environments
 */
export class ConsoleDashboard {
    constructor(fearDataGen, autoBalancer) {
        this.dataGen = fearDataGen;
        this.balancer = autoBalancer;
        this.updateInterval = 5000; // 5 seconds
        this.timer = null;
    }
    
    start() {
        console.log('[ConsoleDashboard] Starting...');
        this.timer = setInterval(() => this._print(), this.updateInterval);
    }
    
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    _print() {
        const stats = this.dataGen.getStats();
        const balance = this.dataGen.getBalanceInfo();
        
        console.clear();
        console.log('╔════════════════════════════════════════════════╗');
        console.log('║         FearDataGen - Collection Stats         ║');
        console.log('╠════════════════════════════════════════════════╣');
        console.log(`║ Trajectories: ${stats.storedTrajectories.toString().padEnd(12)} Valid: ${stats.totalValid.toString().padEnd(12)} ║`);
        console.log(`║ Samples: ${stats.totalSamples.toString().padEnd(17)} Events: ${stats.totalEvents.toString().padEnd(12)} ║`);
        console.log(`║ Rate: ${(stats.collectionRate?.toFixed(1) || 0).toString().padEnd(19)}/min  Memory: ${((stats.memoryUsage / (1024 * 1024)).toFixed(1) + 'MB').padEnd(10)} ║`);
        console.log('╠════════════════════════════════════════════════╣');
        console.log('║ Scenario Distribution:                         ║');
        
        const total = balance.total || 1;
        for (const [scenario, count] of Object.entries(balance.scenarios || {})) {
            const pct = (count / total * 100).toFixed(1);
            const bar = '█'.repeat(Math.floor(pct / 5));
            console.log(`║ ${scenario.padEnd(15)} ${bar.padEnd(20)} ${pct.padStart(5)}% ║`);
        }
        
        console.log('╚════════════════════════════════════════════════╝');
    }
}
