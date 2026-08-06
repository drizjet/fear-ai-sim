/**
 * physicsworker-manager.js - Phase 3.5 Multithreaded Physics
 * Distributes agent physics updates across multiple CPU cores.
 */

export class PhysicsWorkerManager {
    constructor(simulation, workerCount = 4) {
        this.simulation = simulation;
        this.workers = [];
        this.workerCount = workerCount;
        this.isProcessing = false;
        
        // Initialize workers
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker(new URL('./worker-physics.js', import.meta.url), { type: 'module' });
            this.workers.push(worker);
        }
    }

    async updateParallel(agents, predators, width, height) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const batchSize = Math.ceil(agents.length / this.workerCount);
        const promises = [];

        // Prepare predator data once for all workers
        const predatorData = predators.map(p => ({
            x: p.x,
            y: p.y,
            fearRadius: p.config.fearRadius
        }));

        // NEW: Lightweight agent data for social forces (Boids)
        const allAgentsLight = agents.map(a => ({
            id: a.id,
            x: a.x,
            y: a.y,
            vx: a.vx,
            vy: a.vy
        }));

        for (let i = 0; i < this.workerCount; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, agents.length);
            const batch = agents.slice(start, end).map(a => ({
                id: a.id,
                x: a.x,
                y: a.y,
                vx: a.vx,
                vy: a.vy,
                fear: a.brain.currentFear,
                dead: a.dead
            }));

            if (batch.length === 0) continue;

            promises.push(new Promise((resolve) => {
                const worker = this.workers[i];
                worker.onmessage = (e) => resolve(e.data.result);
                worker.postMessage({
                    type: 'UPDATE_BATCH',
                    payload: {
                        agents: batch,
                        predators: predatorData,
                        allAgents: allAgentsLight, // Pass global context for local math
                        width,
                        height
                    }
                });
            }));
        }

        const allResults = await Promise.all(promises);
        
        // Apply results back to agents
        const agentMap = new Map(agents.map(a => [a.id, a]));
        for (const batchResult of allResults) {
            for (const res of batchResult) {
                const agent = agentMap.get(res.id);
                if (agent) {
                    agent.x = res.x;
                    agent.y = res.y;
                    agent.vx = res.vx;
                    agent.vy = res.vy;
                    agent.brain.currentFear = res.fear;
                }
            }
        }

        this.isProcessing = false;
    }

    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
    }
}
