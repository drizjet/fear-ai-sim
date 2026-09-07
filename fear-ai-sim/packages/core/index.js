/**
 * @fear-ai/core - Pure headless, zero-dependency, deterministic Fear AI simulation engine.
 */

export { DeterministicRng } from './src/DeterministicRng.js';
export {
    FearCore,
    FEAR_BANDS,
    CORE_BANDS,
    EXTENDED_BANDS,
    DEFAULT_FEARCORE_CONFIG
} from './src/FearCore.js';
export {
    AffectiveAgent,
    DEFAULT_TRAITS
} from './src/AffectiveAgent.js';
export {
    HabituationSystem,
    DEFAULT_HABITUATION_CONFIG
} from './src/HabituationSystem.js';
export { ContagionGraph } from './src/ContagionGraph.js';
export { TraumaZoneSystem } from './src/TraumaZoneSystem.js';
export {
    PacingDirector,
    SESSION_PHASES
} from './src/PacingDirector.js';
export { IntentResolver, ACTION_INTENTS } from './src/IntentResolver.js';
export { PsychoacousticSynthesizer } from './src/PsychoacousticSynthesizer.js';
export {
    LayeredMemorySystem,
    MEMORY_LAYERS,
    EPISODIC_EVENT_TYPES,
    SEMANTIC_CATEGORIES,
    DEFAULT_MEMORY_CONFIG
} from './src/LayeredMemorySystem.js';
export {
    RelationshipTensorSystem,
    INTERACTION_TYPES,
    DEFAULT_RELATIONSHIP_CONFIG
} from './src/RelationshipTensorSystem.js';
export {
    GroupContagionSystem,
    GROUP_TYPES,
    GROUP_DOCTRINES,
    GROUP_STATES,
    GROUP_DIRECTIVES,
    DEFAULT_GROUP_CONFIG
} from './src/GroupContagionSystem.js';
export {
    FactionSystem,
    ESCALATION_STAGES,
    FACTION_CULTURES,
    INCIDENT_TYPES,
    DEFAULT_FACTION_CONFIG
} from './src/FactionSystem.js';
export {
    CivilizationSimulationSystem,
    COGNITIVE_LOD_TIERS,
    LOD_CADENCES,
    ROUTE_STATUS,
    COMMODITY_TYPES,
    DEFAULT_CIV_CONFIG
} from './src/CivilizationSimulationSystem.js';


