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
export {
    WorldSimulationSystem,
    ROAMING_PARTY_TYPES,
    ROAMING_STATES,
    ENCOUNTER_TYPES,
    ENCOUNTER_RESOLUTIONS,
    RUMOR_TOPICS,
    WORLD_EVENT_TYPES,
    DEFAULT_WORLD_CONFIG
} from './src/WorldSimulationSystem.js';
export {
    BASELINE_MODELS,
    ABLATION_FLAGS,
    FiniteStateMachineAgent,
    UtilityAIAgent,
    BehaviorTreeAgent,
    SubsystemAblationHarness
} from './src/ComparativeBaselines.js';
export {
    DiagnosticExplainabilityInspector
} from './src/DiagnosticExplainabilityInspector.js';
export {
    HostCapabilityNegotiator,
    HOST_CAPABILITIES,
    INTENT_CAPABILITY_REQUIREMENTS,
    DEFAULT_FALLBACK_CHAIN
} from './src/HostCapabilityNegotiator.js';
export {
    CANONICAL_PRESETS,
    CANONICAL_PRESETS as PRESET_CARDS,
    PresetLibrary,
    DesignerTuningSafetyValidator
} from './src/PresetLibrary.js';
export {
    ReplayWorkbench
} from './src/ReplayWorkbench.js';
export {
    FrontierValleySimulation,
    WorldDegeneracyDetector,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS,
    FRONTIER_VALLEY_ROUTES
} from './src/FrontierValleySimulation.js';
export {
    EconomicFeedbackSystem,
    EconomicPathologyDetector,
    ECONOMIC_PATHOLOGIES
} from './src/EconomicFeedbackSystem.js';
export {
    WorldCounterfactualEngine,
    COUNTERFACTUAL_MUTATIONS
} from './src/WorldCounterfactualEngine.js';
export {
    SituationStrengthProfiler,
    SITUATION_STRENGTH_LEVELS,
    AFFORDANCE_DIMENSIONS,
    SITUATION_PATHOLOGIES
} from './src/SituationStrengthProfiler.js';
export {
    EpistemicBeliefEngine,
    EPISTEMIC_PROVENANCE,
    BELIEF_CATEGORIES
} from './src/EpistemicBeliefEngine.js';
export {
    FactionGovernanceSystem,
    GOVERNANCE_ARCHETYPES,
    FACTION_DIRECTIVES
} from './src/FactionGovernanceSystem.js';
export {
    Spatial3DAdapter,
    TACTICAL_ELEVATION_STATUS,
    OCCLUSION_STATUS,
    COORDINATE_CONVENTIONS,
    Vector3
} from './src/Spatial3DAdapter.js';
export {
    MultiFeedbackCascadeSystem,
    COUPLING_VARIABLES,
    CASCADE_PATHOLOGIES,
    CIRCUIT_BREAKER_INTERVENTIONS
} from './src/MultiFeedbackCascadeSystem.js';
export {
    AdaptiveBudgetBackpressureController,
    DEGRADATION_MODES
} from './src/AdaptiveBudgetBackpressureController.js';
export {
    SettlementMigrationSystem,
    MIGRATION_DRIVERS,
    MIGRANT_PARTY_STATUS
} from './src/SettlementMigrationSystem.js';
export {
    MemoryConsolidationEngine,
    MemoryPathologyDetector,
    PROTECTION_CLASSES,
    MEMORY_PATHOLOGY_TYPES
} from './src/MemoryConsolidationEngine.js';
export {
    WorldSnapshotMigrator,
    SaveSizeCompactor,
    SNAPSHOT_VERSIONS
} from './src/WorldSnapshotMigrationCompactor.js';




