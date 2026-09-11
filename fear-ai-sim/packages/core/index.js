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
    DEFAULT_FACTION_CONFIG,
    casualtySeverityScale
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
export {
    compactEventLog,
    verifyAnchorClosure,
    mergeColdSummaries,
    mergeColdPairSummaries,
    DEFAULT_ANCHOR_TYPES,
    DEFAULT_BULK_TYPES
} from './src/EventLogCompactor.js';
export {
    RoamingBandSystem,
    BAND_ARCHETYPES,
    BAND_STATES,
    ROAMING_INTENTS,
    ENCOUNTER_CATEGORIES,
    ENCOUNTER_RESOLUTIONS as ROAMING_ENCOUNTER_RESOLUTIONS,
    DEFAULT_BAND_CONFIG
} from './src/RoamingBandSystem.js';
export {
    ScenarioInterventionSystem,
    INTERVENTION_TYPES,
    CONSEQUENCE_DOMAINS
} from './src/ScenarioInterventionSystem.js';
export {
    BehavioralParetoFrontier,
    OBJECTIVE_KEYS,
    DEFAULT_OBJECTIVE_WEIGHTS,
    STANDARD_STRESSOR_REGIMES
} from './src/BehavioralParetoFrontier.js';
export {
    EmergentSystemCollisionHarness,
    COLLISION_SCENARIOS,
    SYSTEMIC_HEALTH_METRICS
} from './src/EmergentSystemCollisionHarness.js';
export {
    TraumaCrystallizationEngine,
    PhobicTriggerRegistry,
    TRAUMA_TYPES,
    TRAUMA_STAGES,
    PHOBIC_CATEGORIES
} from './src/TraumaCrystallizationEngine.js';
export {
    SharedTraumaClock
} from './src/SharedTraumaClock.js';
export {
    TradeCaravanSupplyChainSystem,
    CARAVAN_STATUS,
    ESCORT_TIERS
} from './src/TradeCaravanSupplyChainSystem.js';
export {
    MultiObserverEpistemicHarness,
    INFORMATION_CHANNELS
} from './src/MultiObserverEpistemicHarness.js';
export {
    FabeWorldBenchmarkSuite,
    BENCHMARK_DIMENSIONS,
    DEGENERACY_FLAGS
} from './src/FabeWorldBenchmarkSuite.js';
export {
    ScenarioValidator,
    ScenarioInstantiator,
    ScenarioFuzzer,
    PropertyVerifier,
    TIMELINE_EVENT_TYPES,
    VALIDATION_ERROR_CODES
} from './src/DeclarativeScenarioEngine.js';
export {
    MetamorphicVerificationHarness,
    METAMORPHIC_RELATIONS
} from './src/MetamorphicVerificationHarness.js';
export {
    CoalitionDiplomacyEngine,
    TREATY_TYPES,
    ESPIONAGE_OPERATIONS,
    COALITION_STATUS,
    CALL_TO_ARMS_RESPONSES
} from './src/CoalitionDiplomacyEngine.js';
export {
    ParallelBatchEvaluator,
    SharedMemoryEntityBuffer,
    ENTITY_FIELD_OFFSETS,
    INTENT_CODES,
    INTENT_NAMES
} from './src/ParallelBatchEvaluator.js';
export {
    ScenarioStepper,
    BREAKPOINT_TYPES
} from './src/ScenarioStepper.js';
export {
    MoralDissonanceEngine,
    MORAL_FOUNDATIONS,
    DEFAULT_MORAL_PROFILES,
    TRANSGRESSION_TYPES,
    TRANSGRESSION_PROFILES,
    ATONEMENT_TYPES,
    ATONEMENT_PROFILES
} from './src/MoralDissonanceEngine.js';
export {
    CausalEventGraph,
    CAUSAL_DOMAINS,
    recordDecisionOutcome
} from './src/CausalEventGraph.js';
export {
    HostFeedbackLoop,
    INTENT_OUTCOMES,
    FAILURE_REASONS,
    DEFAULT_EXECUTION_FALLBACKS
} from './src/HostFeedbackLoop.js';
export {
    SubsystemResilienceHarness,
    MODULE_STATUS,
    CANONICAL_OPTIONAL_MODULES
} from './src/SubsystemResilienceHarness.js';
export {
    GoalArbitrationEngine,
    GOAL_TYPES,
    ROLE_CONSTRAINTS,
    COURAGE_FEAR_THRESHOLD,
    CALM_FEAR_CEILING
} from './src/GoalArbitrationEngine.js';
export {
    PerceptionRobustnessEngine,
    NOISE_PROFILES,
    PERCEPT_INTENTS
} from './src/PerceptionRobustnessEngine.js';
export {
    HostTimeDiscipline,
    SUBSYSTEM_CADENCES
} from './src/HostTimeDiscipline.js';
export {
    ExtensionRegistry
} from './src/ExtensionRegistry.js';
export {
    ObservabilityHooks,
    METRIC_KINDS
} from './src/ObservabilityHooks.js';
export {
    TuningValidator,
    TRAIT_BOUNDS,
    DESIGNER_DEFAULTS
} from './src/TuningValidator.js';
export {
 IntentStabilizer
} from './src/IntentStabilizer.js';
export {
 CharacterIdentityArchitecture,
 IDENTITY_TRAITS,
 ADAPTIVE_TRACKS,
 STATE_CHANNELS,
 IDENTITY_GAIN_WEIGHTS,
 attributeGain
} from './src/CharacterIdentityArchitecture.js';
export {
 FunctionalPersonaSignatures,
 SIGNATURE_FUNCTIONS,
 DEFAULT_PROBE_GRID,
 evaluateResponseFunctions
} from './src/FunctionalPersonaSignatures.js';
export {
 LongHorizonCharacterLife,
 LIFE_HORIZONS,
 GENERIC_ATTRACTORS
} from './src/LongHorizonCharacterLife.js';
export {
 InformationPropagationEngine,
 PROPAGATED_RUMOR_TOPICS,
 RUMOR_STATUS,
 DEFAULT_PROPAGATION_CONFIG
} from './src/InformationPropagationEngine.js';
export {
 AnticipatoryFearEngine,
 DREAD_TARGETS,
 DEFAULT_DREAD_CONFIG
} from './src/AnticipatoryFearEngine.js';
export {
 MisinformationCascadeHarness,
 DEFAULT_CASCADE_CONFIG
} from './src/MisinformationCascadeHarness.js';
export {
 SocialBehaviorEffects,
 SOCIAL_DECISIONS,
 scoreSocialDecisions,
 contagionGate
} from './src/SocialBehaviorEffects.js';
export {
 SocialEventEngine,
 SOCIAL_EVENTS
} from './src/SocialEventEngine.js';
export {
 CollectiveCourageHarness,
 DEFAULT_COURAGE_CONFIG
} from './src/CollectiveCourageHarness.js';
export {
 SuccessionEngine,
 SUCCESSION_CAUSES,
 SUCCESSION_WEIGHTS
} from './src/SuccessionEngine.js';
export {
 RetaliationModel,
 PROVOCATION_SEVERITY,
 RETALIATION_INTENTS,
 DEFAULT_RETALIATION_CONFIG
} from './src/RetaliationModel.js';
export {
 SecurityDilemmaHarness,
 DEFAULT_DILEMMA_CONFIG
} from './src/SecurityDilemmaHarness.js';
export {
 TradeDependencyEngine,
 DEFAULT_DEPENDENCY_CONFIG,
 resolveLedgerNowTick
} from './src/TradeDependencyEngine.js';
export {
 BlockadeEngine,
 DEFAULT_BLOCKADE_CONFIG
} from './src/BlockadeEngine.js';
export {
 ScarcityPressureHarness
} from './src/ScarcityPressureHarness.js';
export {
 EncounterConsequenceEngine
} from './src/EncounterConsequenceEngine.js';
export {
 RefugeeInformationHarness,
 FLIGHT_CAUSES
} from './src/RefugeeInformationHarness.js';
export {
 MovementMotiveRanker,
 MOVEMENT_MOTIVES,
 ARCHETYPE_MOTIVE_PRIORS
} from './src/MovementMotiveRanker.js';
export {
 ValleyChainScenario,
 CHAIN_LINKS
} from './src/ValleyChainScenario.js';
export {
 ValleyOutcomeDistribution
} from './src/ValleyOutcomeDistribution.js';
export {
 LodDirector,
 LOD_TIERS,
 LOD_CADENCE,
 DEFAULT_LOD_CONFIG
} from './src/LodDirector.js';
export {
 LodVaultCycle,
 ABSTRACT_TIERS
} from './src/LodVaultCycle.js';
export {
 IdentityVault
} from './src/IdentityVault.js';
export {
 ScaleHarness,
 SCALE_STEPS
} from './src/ScaleHarness.js';
export {
 WhyNotExplainer
} from './src/WhyNotExplainer.js';
export {
 ExplanationFidelityHarness
} from './src/ExplanationFidelityHarness.js';
export {
 FabeChunkIntegrationSuite,
 CHUNK_BENCHMARK_DIMENSIONS,
 CHUNK_DIMENSION_THRESHOLDS
} from './src/FabeChunkIntegrationSuite.js';
export {
 MemoryRelevanceScorer,
 RELEVANCE_WEIGHTS,
 RELEVANCE_HALF_LIFE_TICKS
} from './src/MemoryRelevanceScorer.js';
export {
 MemoryPathologyBattery,
 MEMORY_PATHOLOGY_PROBES
} from './src/MemoryPathologyBattery.js';
export {
 InteractionCoverageGraph
} from './src/InteractionCoverageGraph.js';
export {
 RumorMemory,
 RUMOR_BELIEF_STATUS,
 DEFAULT_RUMOR_MEMORY_CONFIG
} from './src/RumorMemory.js';
export {
 RouteMemory,
 DEFAULT_ROUTE_MEMORY_CONFIG
} from './src/RouteMemory.js';
export {
 SubsystemOverheadHarness,
 OVERHEAD_BUDGETS_US
} from './src/SubsystemOverheadHarness.js';
export {
 InteractionMutationHarness
} from './src/InteractionMutationHarness.js';
export {
 PlaceMemory,
 DEFAULT_PLACE_MEMORY_CONFIG
} from './src/PlaceMemory.js';




