/**
 * packages/core/src/ReplayWorkbench.js
 *
 * Sections 81-82 / Front E: Replay Workbench & First-Divergence Debugger.
 *
 * Given two simulation replays (e.g. baseline vs candidate, or two seeded runs),
 * the First-Divergence Debugger performs deep tick-by-tick structural diffing to isolate
 * the exact tick, entity, subsystem, property, and values where determinism or behavior diverged.
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Provides diagnostic inspection and divergence analysis on serialized simulation logs.
 */

export class ReplayWorkbench {
    /**
     * Deep-compares two replay histories and returns the exact point of first divergence.
     * @param {Object} replayA - Replay object containing { seed, ticks: Array<TickState> }
     * @param {Object} replayB - Replay object containing { seed, ticks: Array<TickState> }
     * @param {Object} [options={}]
     * @param {number} [options.floatTolerance=1e-5] - Numerical tolerance for float comparisons
     * @returns {{
     *   diverged: boolean,
     *   firstDivergence: {
     *     tick: number,
     *     subsystem: string,
     *     targetId: string,
     *     property: string,
     *     valueA: any,
     *     valueB: any,
     *     previousTickConsistent: boolean,
     *     explanation: string
     *   }|null,
     *   totalTicksCompared: number,
     *   summary: string
     * }}
     */
    static compareReplays(replayA, replayB, options = {}) {
        const floatTolerance = options.floatTolerance ?? 1e-5;

        if (!replayA || !replayB) {
            return {
                diverged: true,
                firstDivergence: {
                    tick: 0,
                    subsystem: 'ROOT',
                    targetId: 'REPLAY_OBJECT',
                    property: 'null_check',
                    valueA: !!replayA,
                    valueB: !!replayB,
                    previousTickConsistent: false,
                    explanation: 'One or both replay objects are null/undefined.'
                },
                totalTicksCompared: 0,
                summary: 'Failed null check on input replays.'
            };
        }

        const ticksA = Array.isArray(replayA.ticks) ? replayA.ticks : (Array.isArray(replayA) ? replayA : []);
        const ticksB = Array.isArray(replayB.ticks) ? replayB.ticks : (Array.isArray(replayB) ? replayB : []);

        const minTicks = Math.min(ticksA.length, ticksB.length);
        if (minTicks === 0 && (ticksA.length > 0 || ticksB.length > 0)) {
            return {
                diverged: true,
                firstDivergence: {
                    tick: 0,
                    subsystem: 'STREAM',
                    targetId: 'LENGTH',
                    property: 'length',
                    valueA: ticksA.length,
                    valueB: ticksB.length,
                    previousTickConsistent: false,
                    explanation: `Tick stream lengths differ at start: ${ticksA.length} vs ${ticksB.length}`
                },
                totalTicksCompared: 0,
                summary: 'One replay has 0 ticks while the other has entries.'
            };
        }

        let previousTickConsistent = true;

        for (let t = 0; t < minTicks; t++) {
            const frameA = ticksA[t];
            const frameB = ticksB[t];
            const tickNum = frameA.tick ?? t;

            // 1. Compare Entities Subsystem
            const divEntities = this._compareEntityCollections(frameA.entities, frameB.entities, tickNum, floatTolerance);
            if (divEntities) {
                return {
                    diverged: true,
                    firstDivergence: { ...divEntities, previousTickConsistent },
                    totalTicksCompared: t + 1,
                    summary: `Diverged at tick ${tickNum} in entity '${divEntities.targetId}' property '${divEntities.property}'.`
                };
            }

            // 2. Compare Factions Subsystem
            const divFactions = this._compareKeyedObjects(frameA.factions, frameB.factions, tickNum, 'factions', floatTolerance);
            if (divFactions) {
                return {
                    diverged: true,
                    firstDivergence: { ...divFactions, previousTickConsistent },
                    totalTicksCompared: t + 1,
                    summary: `Diverged at tick ${tickNum} in faction '${divFactions.targetId}' property '${divFactions.property}'.`
                };
            }

            // 3. Compare Groups Subsystem
            const divGroups = this._compareKeyedObjects(frameA.groups, frameB.groups, tickNum, 'groups', floatTolerance);
            if (divGroups) {
                return {
                    diverged: true,
                    firstDivergence: { ...divGroups, previousTickConsistent },
                    totalTicksCompared: t + 1,
                    summary: `Diverged at tick ${tickNum} in group '${divGroups.targetId}' property '${divGroups.property}'.`
                };
            }

            // 4. Compare State Hash if present
            if (frameA.stateHash && frameB.stateHash && frameA.stateHash !== frameB.stateHash) {
                return {
                    diverged: true,
                    firstDivergence: {
                        tick: tickNum,
                        subsystem: 'STATE_HASH',
                        targetId: 'FRAME',
                        property: 'stateHash',
                        valueA: frameA.stateHash,
                        valueB: frameB.stateHash,
                        previousTickConsistent,
                        explanation: `State hash divergence at tick ${tickNum}: '${frameA.stateHash}' vs '${frameB.stateHash}'`
                    },
                    totalTicksCompared: t + 1,
                    summary: `Diverged at tick ${tickNum} on frame stateHash.`
                };
            }

            previousTickConsistent = true;
        }

        // If all compared ticks match but lengths differ
        if (ticksA.length !== ticksB.length) {
            return {
                diverged: true,
                firstDivergence: {
                    tick: minTicks,
                    subsystem: 'STREAM',
                    targetId: 'LENGTH',
                    property: 'length',
                    valueA: ticksA.length,
                    valueB: ticksB.length,
                    previousTickConsistent: true,
                    explanation: `Replay A truncated or longer than Replay B (${ticksA.length} vs ${ticksB.length}).`
                },
                totalTicksCompared: minTicks,
                summary: `Replays matched up to tick ${minTicks - 1}, but have different total lengths.`
            };
        }

        return {
            diverged: false,
            firstDivergence: null,
            totalTicksCompared: minTicks,
            summary: `All ${minTicks} ticks match identically within numerical tolerance ${floatTolerance}.`
        };
    }

    static _compareEntityCollections(entitiesA, entitiesB, tick, tolerance) {
        if (!entitiesA && !entitiesB) return null;
        if (!entitiesA || !entitiesB) {
            return {
                tick,
                subsystem: 'entities',
                targetId: 'COLLECTION',
                property: 'existence',
                valueA: !!entitiesA,
                valueB: !!entitiesB,
                explanation: 'Entity collection missing in one replay.'
            };
        }

        const mapA = this._toMap(entitiesA);
        const mapB = this._toMap(entitiesB);

        // Check for missing/extra entities
        for (const id of mapA.keys()) {
            if (!mapB.has(id)) {
                return {
                    tick,
                    subsystem: 'entities',
                    targetId: id,
                    property: 'presence',
                    valueA: 'PRESENT',
                    valueB: 'MISSING',
                    explanation: `Entity '${id}' exists in Replay A but missing in Replay B at tick ${tick}.`
                };
            }

            const entA = mapA.get(id);
            const entB = mapB.get(id);
            const propsToCompare = ['fear', 'band', 'intent', 'arousal', 'cooldown'];

            for (const prop of propsToCompare) {
                if (entA[prop] !== undefined || entB[prop] !== undefined) {
                    const diff = this._areValuesDifferent(entA[prop], entB[prop], tolerance);
                    if (diff) {
                        return {
                            tick,
                            subsystem: 'entities',
                            targetId: id,
                            property: prop,
                            valueA: entA[prop],
                            valueB: entB[prop],
                            explanation: `Entity '${id}' property '${prop}' diverged at tick ${tick}: ${entA[prop]} vs ${entB[prop]}`
                        };
                    }
                }
            }
        }

        for (const id of mapB.keys()) {
            if (!mapA.has(id)) {
                return {
                    tick,
                    subsystem: 'entities',
                    targetId: id,
                    property: 'presence',
                    valueA: 'MISSING',
                    valueB: 'PRESENT',
                    explanation: `Entity '${id}' exists in Replay B but missing in Replay A at tick ${tick}.`
                };
            }
        }

        return null;
    }

    static _compareKeyedObjects(objA, objB, tick, subsystem, tolerance) {
        if (!objA && !objB) return null;
        if (!objA || !objB) {
            return {
                tick,
                subsystem,
                targetId: 'COLLECTION',
                property: 'existence',
                valueA: !!objA,
                valueB: !!objB,
                explanation: `${subsystem} collection missing in one replay.`
            };
        }

        const mapA = this._toMap(objA);
        const mapB = this._toMap(objB);

        for (const [key, valA] of mapA.entries()) {
            if (!mapB.has(key)) {
                return {
                    tick,
                    subsystem,
                    targetId: key,
                    property: 'presence',
                    valueA: 'PRESENT',
                    valueB: 'MISSING',
                    explanation: `Item '${key}' in ${subsystem} missing in Replay B.`
                };
            }

            const valB = mapB.get(key);
            if (typeof valA === 'object' && typeof valB === 'object') {
                for (const subKey of Object.keys(valA)) {
                    if (this._areValuesDifferent(valA[subKey], valB[subKey], tolerance)) {
                        return {
                            tick,
                            subsystem,
                            targetId: key,
                            property: subKey,
                            valueA: valA[subKey],
                            valueB: valB[subKey],
                            explanation: `${subsystem} '${key}' property '${subKey}' diverged at tick ${tick}: ${valA[subKey]} vs ${valB[subKey]}`
                        };
                    }
                }
            } else if (this._areValuesDifferent(valA, valB, tolerance)) {
                return {
                    tick,
                    subsystem,
                    targetId: key,
                    property: 'value',
                    valueA: valA,
                    valueB: valB,
                    explanation: `${subsystem} '${key}' diverged at tick ${tick}: ${valA} vs ${valB}`
                };
            }
        }

        return null;
    }

    static _toMap(collection) {
        const map = new Map();
        if (!collection) return map;

        if (Array.isArray(collection)) {
            for (let i = 0; i < collection.length; i++) {
                const item = collection[i];
                const key = item.id || item.name || String(i);
                map.set(key, item);
            }
        } else if (typeof collection === 'object') {
            for (const [key, val] of Object.entries(collection)) {
                map.set(key, val);
            }
        }
        return map;
    }

    static _areValuesDifferent(a, b, tolerance) {
        if (typeof a === 'number' && typeof b === 'number') {
            return Math.abs(a - b) > tolerance;
        }
        return a !== b;
    }
}
