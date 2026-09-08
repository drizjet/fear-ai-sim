/**
 * tests/adaptive-budget-backpressure.test.js
 * Front D / Sections 59–60: Adaptive Computational Budgeting & Host Backpressure Controller Test Suite.
 */

import {
    AdaptiveBudgetBackpressureController,
    DEGRADATION_MODES
} from '../packages/core/index.js';

describe('Front D / Sections 59–60: Adaptive Budgeting & Host Backpressure Controller', () => {
    let controller;

    beforeEach(() => {
        controller = new AdaptiveBudgetBackpressureController({
            maxFrameTimeMs: 2.0,
            maxAgentsPerBatch: 50,
            queueCapacity: 100
        });
    });

    test('1. Calculates dynamic priority favoring terrified, urgent, and close-proximity agents', () => {
        controller.enqueueAgentUpdate('calm_distant', { fear: 0.1, urgency: 0.1, distance: 80.0 }, 1);
        controller.enqueueAgentUpdate('terrified_close', { fear: 0.95, urgency: 0.90, distance: 3.0 }, 1);

        const executionOrder = [];
        controller.processBatch((id) => {
            executionOrder.push(id);
        }, 1, 10.0);

        expect(executionOrder[0]).toBe('terrified_close');
        expect(executionOrder[1]).toBe('calm_distant');
    });

    test('2. O(1) update coalescing prevents duplicate queue bloat across high-frequency ticks', () => {
        // Enqueue same agent 5 times in rapid succession
        for (let i = 0; i < 5; i++) {
            const res = controller.enqueueAgentUpdate('patrol_leader', { fear: 0.2 + (i * 0.1) }, i);
            if (i === 0) {
                expect(res.action).toBe('ENQUEUED');
            } else {
                expect(res.action).toBe('COALESCED');
            }
        }

        const tele = controller.getTelemetry();
        expect(tele.queueDepth).toBe(1);
        expect(tele.totalCoalesced).toBe(4);
    });

    test('3. Enforces strict CPU budget limits and carries forward backlog gracefully', () => {
        // Enqueue 40 agents with an artificial slow tick runner
        for (let i = 0; i < 40; i++) {
            controller.enqueueAgentUpdate(`agent_${i}`, { fear: 0.5 }, 1);
        }

        // Run with tight budget of 1.0 ms
        const report = controller.processBatch((id) => {
            // Artificial busywork (0.1ms per item)
            const end = performance.now() + 0.15;
            while (performance.now() < end) {}
        }, 1, 1.0);

        expect(report.budgetExceeded).toBe(true);
        expect(report.processedCount).toBeLessThan(40);
        expect(report.remainingQueueDepth).toBeGreaterThan(0);
    });

    test('4. Bounded capacity drops excess updates during emergency burst overloads', () => {
        const smallController = new AdaptiveBudgetBackpressureController({
            queueCapacity: 10
        });

        for (let i = 0; i < 15; i++) {
            smallController.enqueueAgentUpdate(`agent_${i}`, { fear: 0.5 }, 1);
        }

        const tele = smallController.getTelemetry();
        expect(tele.queueDepth).toBe(10);
        expect(tele.totalDropped).toBe(5);
        expect(tele.currentMode).toBe(DEGRADATION_MODES.EMERGENCY_THROTTLING);
    });

    test('5. Starvation prevention prioritizes long-waiting background agents over time', () => {
        // Enqueue background agent at Tick 1
        controller.enqueueAgentUpdate('old_background_civilian', { fear: 0.1, urgency: 0.0, distance: 50.0 }, 1);

        // Advance 20 ticks into the future and submit a new moderate agent
        controller.enqueueAgentUpdate('new_moderate_agent', { fear: 0.3, urgency: 0.2, distance: 20.0 }, 20);

        const order = [];
        controller.processBatch((id) => {
            order.push(id);
        }, 20, 10.0);

        // The old background civilian should receive starvation boost and be processed first
        expect(order[0]).toBe('old_background_civilian');
    });

    test('6. Strictly preserves Host Game Authority Invariant with zero host state mutation', () => {
        const hostEntity = {
            id: 'actor_77',
            fear: 0.85,
            health: 90,
            transform: { x: 10, y: 0, z: 20 }
        };

        const isUnmutated = controller.validateHostAuthorityInvariant(hostEntity);
        expect(isUnmutated).toBe(true);
        expect(hostEntity.health).toBe(90);
        expect(hostEntity.transform.x).toBe(10);
    });
});
