/**
 * Real-Time Analytics Dashboard
 * Phase 2: Metrics & Analytics (T2.6)
 * 
 * Live visualization of fear metrics, state distributions, and performance
 */

export class RealTimeDashboard {
    constructor(containerId, simulation) {
        this.container = document.getElementById(containerId);
        this.simulation = simulation;
        this.isVisible = false;
        this.updateInterval = null;
        this.charts = {};
        
        // Chart configuration
        this.maxDataPoints = 100;
        this.colors = {
            CALM: '#4CAF50',
            ALERT: '#FFC107',
            ANXIOUS: '#FF9800',
            PANIC: '#F44336',
            HIDE: '#9E9E9E',
            RECOVER: '#00BCD4',
            FREEZE: '#673AB7'
        };
        
        this.init();
    }

    init() {
        if (!this.container) {
            console.error('Dashboard container not found:', this.container);
            return;
        }
        
        this.createStyles();
        this.createLayout();
        this.createCharts();
        this.attachEventListeners();
    }

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .fear-dashboard {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 400px;
                max-height: 90vh;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid #333;
                border-radius: 8px;
                padding: 15px;
                color: #fff;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                overflow-y: auto;
                z-index: 1000;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            }
            
            .dashboard-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #333;
            }
            
            .dashboard-title {
                font-size: 14px;
                font-weight: bold;
                color: #00ff88;
            }
            
            .dashboard-close {
                background: none;
                border: none;
                color: #fff;
                font-size: 18px;
                cursor: pointer;
                padding: 0 5px;
            }
            
            .dashboard-close:hover {
                color: #ff4444;
            }
            
            .metric-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .metric-card {
                background: rgba(255, 255, 255, 0.05);
                padding: 10px;
                border-radius: 4px;
                border-left: 3px solid #00ff88;
            }
            
            .metric-label {
                color: #888;
                font-size: 10px;
                text-transform: uppercase;
            }
            
            .metric-value {
                font-size: 18px;
                font-weight: bold;
                color: #fff;
            }
            
            .chart-container {
                margin-bottom: 15px;
                background: rgba(255, 255, 255, 0.02);
                padding: 10px;
                border-radius: 4px;
            }
            
            .chart-title {
                font-size: 11px;
                color: #888;
                margin-bottom: 8px;
                text-transform: uppercase;
            }
            
            .chart-canvas {
                width: 100%;
                height: 100px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 4px;
            }
            
            .fear-bars {
                display: flex;
                height: 80px;
                gap: 4px;
                align-items: flex-end;
                padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 4px;
            }
            
            .fear-bar {
                flex: 1;
                min-width: 20px;
                transition: height 0.3s ease;
                border-radius: 2px 2px 0 0;
                position: relative;
            }
            
            .fear-bar-label {
                position: absolute;
                bottom: -18px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 9px;
                color: #888;
                white-space: nowrap;
            }
            
            .fear-bar-value {
                position: absolute;
                top: -15px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 9px;
                color: #fff;
            }
            
            .state-legend {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 10px;
                font-size: 10px;
            }
            
            .legend-item {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .legend-color {
                width: 10px;
                height: 10px;
                border-radius: 2px;
            }
            
            .performance-bar {
                height: 4px;
                background: #333;
                border-radius: 2px;
                overflow: hidden;
                margin-top: 5px;
            }
            
            .performance-fill {
                height: 100%;
                border-radius: 2px;
                transition: width 0.3s ease;
            }
            
            .export-btn {
                width: 100%;
                padding: 8px;
                background: #00ff88;
                color: #000;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 11px;
                margin-top: 10px;
            }
            
            .export-btn:hover {
                background: #00cc6a;
            }
            
            .dashboard-toggle {
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                background: rgba(0, 255, 136, 0.2);
                border: 1px solid #00ff88;
                color: #00ff88;
                border-radius: 4px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                font-size: 11px;
                z-index: 1001;
            }
            
            .dashboard-toggle:hover {
                background: rgba(0, 255, 136, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    createLayout() {
        this.container.innerHTML = `
            <div class="fear-dashboard" id="dashboard-panel" style="display: none;">
                <div class="dashboard-header">
                    <span class="dashboard-title">⚡ Fear-AI Dashboard</span>
                    <button class="dashboard-close" id="dashboard-close">×</button>
                </div>
                
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="metric-label">Population</div>
                        <div class="metric-value" id="metric-population">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Avg Fear</div>
                        <div class="metric-value" id="metric-avg-fear">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">FPS</div>
                        <div class="metric-value" id="metric-fps">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Panic Events</div>
                        <div class="metric-value" id="metric-panic">-</div>
                    </div>
                </div>
                
                <div class="chart-container">
                    <div class="chart-title">Fear Level Distribution (T2.2)</div>
                    <div class="fear-bars" id="fear-bars"></div>
                </div>
                
                <div class="chart-container">
                    <div class="chart-title">State Distribution Over Time</div>
                    <canvas class="chart-canvas" id="state-chart"></canvas>
                </div>
                
                <div class="chart-container">
                    <div class="chart-title">Population & Fear Trends</div>
                    <canvas class="chart-canvas" id="trend-chart"></canvas>
                </div>
                
                <div class="chart-container">
                    <div class="chart-title">Performance</div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #888;">
                        <span>Frame Time</span>
                        <span id="perf-fps">60 FPS</span>
                    </div>
                    <div class="performance-bar">
                        <div class="performance-fill" id="perf-bar" style="width: 100%; background: #00ff88;"></div>
                    </div>
                </div>
                
                <button class="export-btn" id="export-metrics">Export Metrics (JSON)</button>
            </div>
            
            <button class="dashboard-toggle" id="dashboard-toggle">📊 Dashboard</button>
        `;
    }

    createCharts() {
        this.stateChart = this.container.querySelector('#state-chart');
        this.trendChart = this.container.querySelector('#trend-chart');
        this.stateCtx = this.stateChart.getContext('2d');
        this.trendCtx = this.trendChart.getContext('2d');
        
        // Set canvas sizes
        this.resizeCanvases();
        
        // Initialize data arrays
        this.chartData = {
            stateHistory: [],
            populationHistory: [],
            fearHistory: [],
            fpsHistory: []
        };
    }

    resizeCanvases() {
        const containers = this.container.querySelectorAll('.chart-canvas');
        containers.forEach(canvas => {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width - 20;
            canvas.height = 100;
        });
    }

    attachEventListeners() {
        const toggle = this.container.querySelector('#dashboard-toggle');
        const close = this.container.querySelector('#dashboard-close');
        const panel = this.container.querySelector('#dashboard-panel');
        const exportBtn = this.container.querySelector('#export-metrics');
        
        toggle.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            toggle.style.display = panel.style.display === 'none' ? 'block' : 'none';
            this.isVisible = panel.style.display === 'block';
            
            if (this.isVisible) {
                this.start();
            } else {
                this.stop();
            }
        });
        
        close.addEventListener('click', () => {
            panel.style.display = 'none';
            toggle.style.display = 'block';
            this.isVisible = false;
            this.stop();
        });
        
        exportBtn.addEventListener('click', () => {
            this.exportMetrics();
        });
        
        window.addEventListener('resize', () => this.resizeCanvases());
    }

    start() {
        if (this.updateInterval) return;
        
        this.updateInterval = setInterval(() => {
            this.update();
        }, 500); // Update every 500ms
        
        this.update(); // Initial update
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    update() {
        if (!this.simulation || !this.isVisible) return;
        
        const metrics = this.collectMetrics();
        this.updateMetrics(metrics);
        this.updateFearBars(metrics);
        this.updateStateChart();
        this.updateTrendChart();
        this.updatePerformance();
    }

    collectMetrics() {
        const agents = this.simulation.agents || [];
        const aliveAgents = agents.filter(a => !a.dead);
        
        if (aliveAgents.length === 0) {
            return {
                population: 0,
                avgFear: 0,
                fearDist: { CALM: 0, ALERT: 0, ANXIOUS: 0, PANIC: 0 },
                stateDist: { CALM: 0, ALERT: 0, ANXIOUS: 0, PANIC: 0, HIDE: 0, RECOVER: 0, FREEZE: 0 }
            };
        }
        
        const fearLevels = aliveAgents.map(a => a.brain.currentFear);
        const avgFear = fearLevels.reduce((a, b) => a + b, 0) / fearLevels.length;
        
        return {
            population: aliveAgents.length,
            avgFear: avgFear,
            fearDist: {
                CALM: aliveAgents.filter(a => a.brain.currentFear < 0.2).length,
                ALERT: aliveAgents.filter(a => a.brain.currentFear >= 0.2 && a.brain.currentFear < 0.5).length,
                ANXIOUS: aliveAgents.filter(a => a.brain.currentFear >= 0.5 && a.brain.currentFear < 0.8).length,
                PANIC: aliveAgents.filter(a => a.brain.currentFear >= 0.8).length
            },
            stateDist: {
                CALM: aliveAgents.filter(a => a.brain.state === 'CALM').length,
                ALERT: aliveAgents.filter(a => a.brain.state === 'ALERT').length,
                ANXIOUS: aliveAgents.filter(a => a.brain.state === 'ANXIOUS').length,
                PANIC: aliveAgents.filter(a => a.brain.state === 'PANIC').length,
                HIDE: aliveAgents.filter(a => a.brain.state === 'HIDE').length,
                RECOVER: aliveAgents.filter(a => a.brain.state === 'RECOVER').length,
                FREEZE: aliveAgents.filter(a => a.brain.state === 'FREEZE').length
            }
        };
    }

    updateMetrics(metrics) {
        this.container.querySelector('#metric-population').textContent = metrics.population;
        this.container.querySelector('#metric-avg-fear').textContent = (metrics.avgFear * 100).toFixed(1) + '%';
        this.container.querySelector('#metric-fps').textContent = Math.round(this.simulation.fps || 60);
        
        const panicEvents = this.simulation.activePanicChains || 0;
        this.container.querySelector('#metric-panic').textContent = panicEvents;
    }

    updateFearBars(metrics) {
        const container = this.container.querySelector('#fear-bars');
        const total = metrics.population || 1;
        
        const states = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC'];
        const colors = ['#4CAF50', '#FFC107', '#FF9800', '#F44336'];
        
        container.innerHTML = states.map((state, i) => {
            const count = metrics.fearDist[state];
            const percentage = (count / total * 100).toFixed(1);
            const height = Math.max(5, percentage);
            
            return `
                <div class="fear-bar" style="height: ${height}%; background: ${colors[i]};">
                    <div class="fear-bar-value">${percentage}%</div>
                    <div class="fear-bar-label">${state}</div>
                </div>
            `;
        }).join('');
    }

    updateStateChart() {
        const ctx = this.stateCtx;
        const canvas = this.stateChart;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        const metrics = this.collectMetrics();
        const total = Math.max(1, metrics.population);
        const states = ['CALM', 'ALERT', 'ANXIOUS', 'PANIC', 'HIDE', 'RECOVER', 'FREEZE'];
        this.chartData.stateHistory.push(states.map(state => metrics.stateDist[state] / total));
        if (this.chartData.stateHistory.length > this.maxDataPoints) this.chartData.stateHistory.shift();
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height);
        
        const history = this.chartData.stateHistory;
        for (let i = 0; i < history.length; i++) {
            const x = history.length === 1 ? 0 : i * width / (history.length - 1);
            const panic = history[i][3] || 0;
            const y = height - panic * height;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (history.length) ctx.stroke();
    }

    updateTrendChart() {
        const ctx = this.trendCtx;
        const canvas = this.trendChart;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < width; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
        
        const metrics = this.collectMetrics();
        this.chartData.populationHistory.push(metrics.population);
        this.chartData.fearHistory.push(metrics.avgFear);
        if (this.chartData.populationHistory.length > this.maxDataPoints) {
            this.chartData.populationHistory.shift();
            this.chartData.fearHistory.shift();
        }
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        const population = this.chartData.populationHistory;
        const maxPopulation = Math.max(1, ...population);
        for (let i = 0; i < population.length; i++) {
            const x = population.length === 1 ? 0 : i * width / (population.length - 1);
            const y = height - (population[i] / maxPopulation) * height;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (population.length) ctx.stroke();
    }

    updatePerformance() {
        const fps = this.simulation.fps || 60;
        const targetFPS = 60;
        const percentage = Math.min(100, (fps / targetFPS) * 100);
        
        const perfBar = this.container.querySelector('#perf-bar');
        const perfText = this.container.querySelector('#perf-fps');
        
        perfBar.style.width = percentage + '%';
        perfText.textContent = Math.round(fps) + ' FPS';
        
        // Color based on performance
        if (percentage > 80) {
            perfBar.style.background = '#00ff88';
        } else if (percentage > 50) {
            perfBar.style.background = '#FFC107';
        } else {
            perfBar.style.background = '#F44336';
        }
    }

    exportMetrics() {
        if (!this.simulation || !this.simulation.metricsCollector) {
            alert('No metrics available to export');
            return;
        }
        
        const data = this.simulation.metricsCollector.exportMetrics();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `fear-ai-metrics-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    destroy() {
        this.stop();
        
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}