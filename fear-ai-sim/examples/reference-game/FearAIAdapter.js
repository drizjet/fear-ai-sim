/**
 * examples/reference-game/FearAIAdapter.js
 *
 * Integration Glue Layer for Outpost Omega / Dungeon Crawler Reference Game.
 * Connects DungeonEngine to Fear AI exclusively via public API.
 *
 * Demonstrates:
 * 1. Translation of game entity state -> Fear AI observations
 * 2. Registration of characters with Big-Five personality profiles
 * 3. Execution of Fear AI semantic intents via game-authoritative pathfinding & combat
 * 4. Defensive handling of edge cases and missing sensory data
 */

import { AffectiveAgent, IntentResolver } from '../../packages/core/index.js';

export class FearAIAdapter {
    constructor(game) {
        this.game = game;
        this.agents = new Map();
    }

    /**
     * Register a dungeon character into Fear AI intelligence
     */
    registerNPC(entityId, personalityProfile = {}) {
        const entity = this.game.entities.get(entityId);
        if (!entity) throw new Error(`Cannot register unknown entity ${entityId}`);

        const agent = new AffectiveAgent(entityId, personalityProfile, {
            name: entity.name,
            x: entity.x,
            y: entity.y,
            z: 0
        });

        this.agents.set(entityId, agent);
        return agent;
    }

    /**
     * Build sensory observation payload from host game state
     */
    buildObservationForEntity(entityId) {
        const entity = this.game.entities.get(entityId);
        if (!entity || !entity.alive) return null;

        const threats = [];
        const peers = [];

        for (const [otherId, other] of this.game.entities.entries()) {
            if (otherId === entityId || !other.alive) continue;

            const dist = Math.hypot(entity.x - other.x, entity.y - other.y);
            const visible = this.game.world.hasLineOfSight(entity.x, entity.y, other.x, other.y);

            if (other.role === 'MONSTER') {
                if (visible && dist <= 12.0) {
                    threats.push({
                        id: otherId,
                        type: 'PREDATOR',
                        distance: dist,
                        intensity: 0.9,
                        x: other.x,
                        y: other.y,
                        z: 0
                    });
                }
            } else {
                if (visible && dist <= 15.0) {
                    peers.push({
                        id: otherId,
                        distance: dist,
                        role: other.role
                    });
                }
            }
        }

        const isSafeHaven = (entity.x === 2 && entity.y === 2);

        return {
            x: entity.x,
            y: entity.y,
            z: 0,
            health: entity.health / entity.maxHealth,
            energy: 1.0,
            inSafeHaven: isSafeHaven,
            threats,
            peers
        };
    }

    /**
     * Advance intelligence for an entity and translate intent to host game action
     */
    stepEntity(entityId, dt = 0.016) {
        const entity = this.game.entities.get(entityId);
        const agent = this.agents.get(entityId);
        if (!entity || !entity.alive || !agent) return null;

        const obs = this.buildObservationForEntity(entityId);
        const intelligence = agent.tick(dt, obs);
        const intent = intelligence.action_intent;

        let hostActionExecuted = 'NONE';

        // Translate semantic intent to authoritative game execution
        switch (intent.type) {
            case 'FLEE':
            case 'FLEE_FROM': {
                // Host game plans legal path away from threat toward sanctuary (2, 2)
                const path = this.game.world.findPathBFS(entity.x, entity.y, 2, 2);
                if (path.length > 0) {
                    const nextStep = path[0];
                    this.game.moveEntity(entityId, nextStep.x, nextStep.y);
                    hostActionExecuted = `FLED_TO_${nextStep.x},${nextStep.y}`;
                } else {
                    hostActionExecuted = 'FLEE_CORNERED';
                }
                break;
            }

            case 'ATTACK_HOSTILE':
            case 'STAND_GROUND': {
                // Find visible monster
                if (obs.threats.length > 0) {
                    const targetThreat = obs.threats[0];
                    const dist = targetThreat.distance;
                    if (dist <= 1.5) {
                        // In melee range: execute attack
                        this.game.resolveAuthoritativeAttack(entityId, targetThreat.id, 30);
                        hostActionExecuted = `ATTACKED_${targetThreat.id}`;
                    } else {
                        // Move toward monster
                        const path = this.game.world.findPathBFS(entity.x, entity.y, targetThreat.x, targetThreat.y);
                        if (path.length > 0) {
                            const nextStep = path[0];
                            this.game.moveEntity(entityId, nextStep.x, nextStep.y);
                            hostActionExecuted = `ADVANCED_TOWARD_${targetThreat.id}`;
                        }
                    }
                }
                break;
            }

            case 'RALLY_TO_LEADER': {
                // Locate TownGuard
                let guardPos = null;
                for (const other of this.game.entities.values()) {
                    if (other.role === 'GUARD' && other.alive) {
                        guardPos = { x: other.x, y: other.y };
                        break;
                    }
                }
                if (guardPos) {
                    const path = this.game.world.findPathBFS(entity.x, entity.y, guardPos.x, guardPos.y);
                    if (path.length > 1) {
                        const nextStep = path[0];
                        this.game.moveEntity(entityId, nextStep.x, nextStep.y);
                        hostActionExecuted = `RALLIED_TOWARD_GUARD`;
                    }
                }
                break;
            }

            case 'CAUTIOUS_EXPLORE':
            case 'INVESTIGATE':
            case 'IDLE':
            default: {
                hostActionExecuted = 'PATROL_OR_HOLD';
                break;
            }
        }

        return {
            entityId,
            intelligence,
            hostActionExecuted
        };
    }
}
