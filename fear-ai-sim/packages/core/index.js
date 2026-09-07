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
export {
    IntentResolver,
    ACTION_INTENTS
} from './src/IntentResolver.js';
export { PsychoacousticSynthesizer } from './src/PsychoacousticSynthesizer.js';
