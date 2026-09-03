/**
 * Brain Worker Manager
 * Phase 5: Optimization (T5.3)
 * 
 * Manages a pool of Web Workers for parallelizing brain processing
 */

export class BrainWorkerManager {
    constructor(workerCount = 4) {
        this.workers = [];
        this.workerCount = workerCount;
        this.nextWorkerIdx = 0;
        this.pendingTasks = new Map();
        this.taskIdCounter = 0;
        
        // Initialize workers if supported
        if (typeof Worker !== 'undefined') {
            for (let i = 0; i < workerCount; i++) {
                const worker = new Worker(new URL('./worker-ai.js', import.meta.url), { type: 'module' });
                worker.onmessage = (e) => this.handleMessage(e);
                this.workers.push(worker);
            }
        }
    }

    /**
     * Handle message from worker
     */
    handleMessage(e) {
        const { id, type, result } = e.data;
        const task = this.pendingTasks.get(id);
        if (task) {
            task.resolve(result);
            this.pendingTasks.delete(id);
        }
    }

    /**
     * Submit a task to a worker
     */
    submitTask(type, payload) {
        if (this.workers.length === 0) {
            // Fallback for no worker support
            return Promise.resolve(this.fallback(type, payload));
        }
        
        const id = this.taskIdCounter++;
        const worker = this.workers[this.nextWorkerIdx];
        this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
        
        return new Promise((resolve, reject) => {
            this.pendingTasks.set(id, { resolve, reject });
            worker.postMessage({ id, type, payload });
        });
    }

    /**
     * Process multiple tasks in parallel
     */
    async processBatch(type, payloads) {
        return Promise.all(payloads.map(p => this.submitTask(type, p)));
    }

    /**
     * Fallback for environments without worker support
     */
    fallback(type, payload) {
        if (type === 'DECIDE') {
            // Very simple fallback, actual logic should match worker
            return {
                fear: (payload.fear || 0.1) * 0.95,
                state: payload.state || 'CALM',
                adrenaline: (payload.adrenaline || 0.1) - 0.01
            };
        }
        return 0;
    }

    /**
     * Terminate all workers
     */
    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.pendingTasks.clear();
    }
}
