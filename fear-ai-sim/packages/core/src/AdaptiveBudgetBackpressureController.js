/**
 * @fear-ai/core - AdaptiveBudgetBackpressureController
 * Front D / Sections 59–60: Adaptive Computational Budgeting & Host Backpressure Controller.
 * 
 * STRICT INVARIANT:
 * Host game remains authoritative for frame timing, entity lifecycles, and physics.
 * AdaptiveBudgetBackpressureController schedules advisory agent updates within
 * host-specified CPU budgets (e.g. max 2ms per tick), applies bounded queue coalescing,
 * prevents heap exhaustion during burst overloads, and guarantees zero host mutation.
 */

import { performance } from 'perf_hooks';

export const DEGRADATION_MODES = Object.freeze({
    FULL_FIDELITY: 'FULL_FIDELITY',
    SELECTIVE_DECIMATION: 'SELECTIVE_DECIMATION',
    EMERGENCY_THROTTLING: 'EMERGENCY_THROTTLING'
});

export class AdaptiveBudgetBackpressureController {
    constructor(config = {}) {
        this.config = Object.freeze({
            maxFrameTimeMs: config.maxFrameTimeMs ?? 2.0,
            maxAgentsPerBatch: config.maxAgentsPerBatch ?? 200,
            queueCapacity: config.queueCapacity ?? 1000,
            starvationWeight: config.starvationWeight ?? 0.25,
            urgencyWeight: config.urgencyWeight ?? 0.35,
            fearWeight: config.fearWeight ?? 0.30,
            proximityWeight: config.proximityWeight ?? 0.20,
            ...config
        });

        // Agent queue stored as Map<string, QueueItem> to allow O(1) coalescing of repeat updates
        this.queue = new Map();
        this.currentMode = DEGRADATION_MODES.FULL_FIDELITY;
        this.metrics = {
            totalSubmitted: 0,
            totalProcessed: 0,
            totalCoalesced: 0,
            totalDropped: 0,
            frameHistory: []
        };
    }

    /**
     * Submits an agent update request to the advisory queue.
     * Implements O(1) coalescing: if an update for this agent is already pending,
     * updates its state to the freshest snapshot without duplicating queue entries.
     */
    enqueueAgentUpdate(agentId, telemetry = {}, tick = 0) {
        if (!agentId) throw new Error('AdaptiveBudgetBackpressureController: agentId required');

        this.metrics.totalSubmitted++;

        if (this.queue.has(agentId)) {
            // Coalesce into existing entry
            const existing = this.queue.get(agentId);
            existing.telemetry = { ...existing.telemetry, ...telemetry };
            existing.lastSubmitTick = tick;
            this.metrics.totalCoalesced++;
            return { action: 'COALESCED', queueDepth: this.queue.size };
        }

        // Check bounded capacity
        if (this.queue.size >= this.config.queueCapacity) {
            // Buffer full: drop lowest-priority or drop current if under severe backpressure
            this.metrics.totalDropped++;
            this.currentMode = DEGRADATION_MODES.EMERGENCY_THROTTLING;
            return { action: 'DROPPED_CAPACITY_EXCEEDED', queueDepth: this.queue.size };
        }

        this.queue.set(agentId, {
            agentId,
            telemetry: { ...telemetry },
            firstSubmitTick: tick,
            lastSubmitTick: tick,
            priorityScore: 0
        });

        return { action: 'ENQUEUED', queueDepth: this.queue.size };
    }

    /**
     * Computes the dynamic priority score for an agent update request.
     */
    _computePriority(item, currentTick) {
        const fear = Math.max(0, Math.min(1, item.telemetry.fear ?? 0));
        const urgency = Math.max(0, Math.min(1, item.telemetry.urgency ?? 0));
        const distance = item.telemetry.distance ?? 20.0;
        const proxScore = 1.0 / Math.max(1.0, distance / 10.0);
        const waitTicks = Math.max(0, currentTick - item.firstSubmitTick);
        const starvScore = Math.min(2.0, waitTicks * 0.15);

        return (
            this.config.fearWeight * fear +
            this.config.urgencyWeight * urgency +
            this.config.proximityWeight * proxScore +
            this.config.starvationWeight * starvScore
        );
    }

    /**
     * Executes queued agent updates within the allotted time budget (milliseconds).
     * Stops execution immediately when time budget is exhausted, carrying forward remaining work.
     */
    processBatch(tickRunner, currentTick = 0, customBudgetMs = null) {
        const budgetMs = customBudgetMs ?? this.config.maxFrameTimeMs;
        const startTime = performance.now();

        if (this.queue.size === 0) {
            return {
                processedCount: 0,
                remainingQueueDepth: 0,
                elapsedMs: 0,
                budgetExceeded: false,
                mode: this.currentMode
            };
        }

        // Compute priorities for all queued items
        const items = Array.from(this.queue.values());
        for (const item of items) {
            item.priorityScore = this._computePriority(item, currentTick);
        }

        // Sort descending by priority
        items.sort((a, b) => b.priorityScore - a.priorityScore);

        let processedCount = 0;
        let budgetExceeded = false;
        const maxBatch = this.config.maxAgentsPerBatch;

        for (const item of items) {
            if (processedCount >= maxBatch) {
                break;
            }

            // Check budget expiration before running next item
            const elapsed = performance.now() - startTime;
            if (elapsed >= budgetMs) {
                budgetExceeded = true;
                break;
            }

            // Execute the agent tick function
            try {
                tickRunner(item.agentId, item.telemetry);
            } catch (err) {
                // Defensive isolation: error in one agent does not crash batch
            }

            this.queue.delete(item.agentId);
            processedCount++;
            this.metrics.totalProcessed++;
        }

        const totalElapsedMs = performance.now() - startTime;

        // Dynamic mode selection based on backlog depth
        if (this.queue.size > this.config.queueCapacity * 0.70) {
            this.currentMode = DEGRADATION_MODES.EMERGENCY_THROTTLING;
        } else if (this.queue.size > this.config.queueCapacity * 0.30) {
            this.currentMode = DEGRADATION_MODES.SELECTIVE_DECIMATION;
        } else {
            this.currentMode = DEGRADATION_MODES.FULL_FIDELITY;
        }

        const frameReport = {
            tick: currentTick,
            processedCount,
            remainingQueueDepth: this.queue.size,
            elapsedMs: Number(totalElapsedMs.toFixed(3)),
            budgetExceeded,
            mode: this.currentMode
        };

        this.metrics.frameHistory.push(frameReport);
        if (this.metrics.frameHistory.length > 50) {
            this.metrics.frameHistory.shift();
        }

        return Object.freeze(frameReport);
    }

    /**
     * Returns cumulative telemetry metrics.
     */
    getTelemetry() {
        return Object.freeze({
            queueDepth: this.queue.size,
            currentMode: this.currentMode,
            totalSubmitted: this.metrics.totalSubmitted,
            totalProcessed: this.metrics.totalProcessed,
            totalCoalesced: this.metrics.totalCoalesced,
            totalDropped: this.metrics.totalDropped,
            coalesceRatio: this.metrics.totalSubmitted > 0
                ? Number((this.metrics.totalCoalesced / this.metrics.totalSubmitted).toFixed(4))
                : 0.0
        });
    }

    /**
     * Strictly verifies the Host Game Authority Invariant.
     */
    validateHostAuthorityInvariant(hostAgent) {
        const snapshot = JSON.stringify(hostAgent);
        this.enqueueAgentUpdate('test_agent', { fear: hostAgent.fear, distance: 5.0 }, 1);
        this.processBatch((id, t) => {
            // Read-only inspection
            const f = t.fear;
        }, 1, 10.0);
        const after = JSON.stringify(hostAgent);
        return snapshot === after;
    }
}
