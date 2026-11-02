/**
 * CivilizationSimulationSystem - Civilization-scale world simulation,
 * dynamic economic trade route networks, and 5-tier Cognitive Level-of-Detail (LOD).
 *
 * Implements:
 * 1. 5-Tier Cognitive LOD Engine (LOD0 Immediate to LOD4 Offscreen World)
 * 2. Seamless Promotion/Demotion State Continuity Invariant (zero discontinuous jumps)
 * 3. Dynamic Economic Trade Route Appraisal & Danger Rerouting (detouring around hazards)
 * 4. Nomadic Caravans, Patrols, and Commodity Supply-Demand Flows
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Middleware evaluates route utilities, cognitive cadences, perceived dangers, and trade intents;
 * the host game engine executes unit pathfinding physics, terrain navigation, collision, and inventory.
 */

export const COGNITIVE_LOD_TIERS = Object.freeze({
    LOD0_IMMEDIATE: 0,   // Immediate vicinity (<30m): Full per-tick affective simulation (cadence = 1)
    LOD1_TACTICAL: 1,    // Tactical range (30-80m): Amortized group simulation (cadence = 5)
    LOD2_REGIONAL: 2,    // Regional perimeter (80-250m): Macro-state machine (cadence = 20)
    LOD3_MACRO_ROUTE: 3, // Distant travel corridor (250-1000m): Waypoint advancement (cadence = 100)
    LOD4_OFFSCREEN: 4    // Off-screen background world (>1000m): Statistical aggregate (cadence = 500)
});

export const LOD_CADENCES = Object.freeze({
    [COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE]: 1,
    [COGNITIVE_LOD_TIERS.LOD1_TACTICAL]: 5,
    [COGNITIVE_LOD_TIERS.LOD2_REGIONAL]: 20,
    [COGNITIVE_LOD_TIERS.LOD3_MACRO_ROUTE]: 100,
    [COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN]: 500
});

export const ROUTE_STATUS = Object.freeze({
    SAFE: 'SAFE',
    WATCHFUL: 'WATCHFUL',
    CONTESTED: 'CONTESTED',
    BLOCKED: 'BLOCKED'
});

export const COMMODITY_TYPES = Object.freeze({
    FOOD: 'FOOD',
    TIMBER: 'TIMBER',
    ORE: 'ORE',
    MEDICINE: 'MEDICINE',
    LUXURY: 'LUXURY'
});

export const DEFAULT_CIV_CONFIG = Object.freeze({
    lodThresholds: Object.freeze({
        immediate: 30,     // LOD0 < 30m
        tactical: 80,      // LOD1 < 80m
        regional: 250,     // LOD2 < 250m
        macroRoute: 1000   // LOD3 < 1000m, LOD4 >= 1000m
    }),
    routeDangerHalfLifeTicks: 80.0, // Decay of route danger memory
    maxWaypointsPerRoute: 20,
    // Opt-in: middleware computes route intent only; host retains position and cargo authority.
    distanceAwareTravel: false,
    caravanUnitsPerTick: 1.0
});

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.0;
    return Math.max(0.0, Math.min(1.0, v));
}

function hasNativeBufferBrand(value) {
    // Intrinsic brand reads work for cross-realm native buffers and refuse
    // Proxy receivers without asking for their keys or prototypes.
    try {
        Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')
            .get.call(value);
        return true;
    } catch { /* not an ArrayBuffer */ }
    if (typeof SharedArrayBuffer !== 'undefined') {
        try {
            Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype,
                'byteLength').get.call(value);
            return true;
        } catch { /* not a SharedArrayBuffer */ }
    }
    return false;
}

// Direct simulator snapshots must be detached from live host-defined event
// and nontrade cargo objects, including nested arrays and Dates. Keep cycles,
// sparse array holes and custom toJSON methods intact at this direct boundary;
// the separate authority JSON protocol may still reject cycles. Explicitly
// iterative to avoid blowing the JS call stack on deeply nested metadata.
function cloneHostSnapshotMetadata(root, copies = new WeakMap(), dataOnly = false) {
    const pending = [];
    // Brand getters inspect the real native internal slots across realms,
    // without trusting a host's constructor, prototype, or byteLength getter.
    const nativeBufferLength = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype, 'byteLength').get;
    const nativeResizable = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype, 'resizable')?.get;
    const sharedBufferLength = typeof SharedArrayBuffer === 'undefined' ? null
        : Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength').get;
    const typedBase = Object.getPrototypeOf(Uint8Array.prototype);
    const typedBuffer = Object.getOwnPropertyDescriptor(typedBase, 'buffer').get;
    const typedOffset = Object.getOwnPropertyDescriptor(typedBase, 'byteOffset').get;
    const typedLength = Object.getOwnPropertyDescriptor(typedBase, 'length').get;
    const dataBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer').get;
    const dataOffset = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset').get;
    const dataLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get;
    const nativeTypes = [Int8Array, Uint8Array, Uint8ClampedArray,
        Int16Array, Uint16Array, Int32Array, Uint32Array,
        Float32Array, Float64Array, BigInt64Array, BigUint64Array];
    const hasBrand = (getter, value) => {
        if (!getter) return false;
        try { getter.call(value); return true; } catch { return false; }
    };
    const copy = value => {
        if (value === null || typeof value !== 'object') return value;
        if (copies.has(value)) return copies.get(value);
        if (value instanceof Date) {
            const date = new Date(value.getTime());
            copies.set(value, date);
            return date;
        }
        // WHATWG URL is a host-defined value with internal private slots.
        // Object.create(URL.prototype) fabricates an instanceof URL whose
        // href getter throws. Reconstruct the URL rather than its prototype.
        if (value instanceof URL) {
            const url = new URL(value.href);
            copies.set(value, url);
            return url;
        }
        // Map keys/values and Set members share the same memo as event/cargo
        // roots, including cycles and repeated collection references.
        // structuredClone(value) here would build an isolated second graph
        // and silently split otherwise shared host-owned metadata.
        if (value instanceof Map || value instanceof Set) {
            const collection = value instanceof Map ? new Map() : new Set();
            copies.set(value, collection);
            pending.push([value, collection]);
            return collection;
        }
        // A SharedArrayBuffer is not a detachable snapshot. Falling through
        // to Object.create(SharedArrayBuffer.prototype) fabricates a native
        // instance whose byteLength getter fails, and sharing live memory
        // would violate direct snapshot detachment. Refuse explicitly.
        if (hasBrand(sharedBufferLength, value))
            throw new Error('unsupported shared host memory metadata');
        // A view and its backing ArrayBuffer must resolve through this same
        // memo: cloning each view independently splits intentionally shared
        // bytes between event/cargo roots (and overlapping views).
        if (hasBrand(nativeBufferLength, value)) {
            // Slice produces a fixed buffer for resizable sources and uses
            // foreign-realm Symbol.species for cross-realm buffers. Native
            // structured cloning retains maxByteLength and creates a local
            // genuine ArrayBuffer without invoking the host's constructor.
            const buffer = (nativeResizable?.call(value) ||
                Object.getPrototypeOf(value) !== ArrayBuffer.prototype)
                ? structuredClone(value)
                : ArrayBuffer.prototype.slice.call(value, 0);
            copies.set(value, buffer);
            return buffer;
        }
        if (ArrayBuffer.isView(value)) {
            const dataView = hasBrand(dataBuffer, value);
            const backing = copy(dataView
                ? dataBuffer.call(value) : typedBuffer.call(value));
            const offset = dataView
                ? dataOffset.call(value) : typedOffset.call(value);
            let view;
            const type = dataView ? null : nativeTypes.find(t => value instanceof t);
            // structuredClone reads native view slots, not user-defined
            // .constructor, .length, or Symbol.toStringTag overrides. For a
            // cross-realm view it also identifies its true native element type.
            const sample = (backing.resizable || (!dataView && !type))
                ? structuredClone(value) : null;
            const typed = type ?? (dataView ? null
                : nativeTypes.find(t => sample instanceof t));
            if (!dataView && !typed)
                throw new Error('unsupported host typed array metadata');
            const length = dataView
                ? dataLength.call(value) : typedLength.call(value);
            let tracking = false;
            if (backing.resizable) {
                // JS exposes no length-tracking flag. Resize only a temporary
                // *clone* to observe it, never the live host buffer. If there
                // is no growth headroom, refuse instead of guessing.
                const probe = sample;
                const unit = dataView ? 1 : typed.BYTES_PER_ELEMENT;
                const original = probe.buffer.byteLength;
                if (original + unit > probe.buffer.maxByteLength)
                    throw new Error('unsupported resizable host view metadata');
                probe.buffer.resize(original + unit);
                tracking = (dataView
                    ? dataLength.call(probe) : typedLength.call(probe)) !== length;
            }
            if (dataView) {
                view = tracking
                    ? new DataView(backing, offset)
                    : new DataView(backing, offset, length);
            } else {
                view = tracking
                    ? new typed(backing, offset)
                    : new typed(backing, offset, length);
            }
            // Buffer is Node-specific; preserve its native API on Node while
            // keeping portable Uint8Array behavior outside Node runtimes.
            if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
                view = Buffer.from(backing, offset, length);
            copies.set(value, view);
            return view;
        }
        // RegExp has internal native state but no separate shared buffer.
        if (value instanceof RegExp) {
            const nativeCopy = structuredClone(value);
            copies.set(value, nativeCopy);
            return nativeCopy;
        }
        // Existing host metadata is ordinary JSON-like records/arrays. Avoid
        // assigning into inherited setters (including __proto__) when copying.
        const result = Array.isArray(value)
            ? new Array(value.length)
            : Object.create(Object.getPrototypeOf(value));
        copies.set(value, result);
        pending.push([value, result]);
        return result;
    };
    const result = copy(root);
    while (pending.length) {
        const [source, target] = pending.pop();
        if (source instanceof Map) {
            for (const [key, value] of Map.prototype.entries.call(source))
                Map.prototype.set.call(target, copy(key), copy(value));
            continue;
        }
        if (source instanceof Set) {
            for (const value of Set.prototype.values.call(source))
                Set.prototype.add.call(target, copy(value));
            continue;
        }
        // Object.keys omits enumerable symbol metadata even though direct
        // snapshots are permitted to carry it (authority JSON is separate).
        const keys = [...Object.keys(source),
            ...Object.getOwnPropertySymbols(source).filter(
                key => Object.getOwnPropertyDescriptor(source, key)?.enumerable)];
        for (const key of keys) {
            const descriptor = dataOnly
                ? Object.getOwnPropertyDescriptor(source, key) : null;
            if (dataOnly && !Object.hasOwn(descriptor ?? {}, 'value'))
                throw new Error('host metadata must have own data properties');
            Object.defineProperty(target, key, {
                value: copy(dataOnly ? descriptor.value : source[key]),
                writable: true, enumerable: true,
                configurable: true
            });
        }
    }
    return result;
}

// Explicit opt-in for ordinary data-only host metadata. Only traverse own
// descriptors; an accessor is refused before its getter is read. Native
// collections are walked through their internal slots so a getter nested in
// a Map/Set member is not missed. Proxy reflection traps remain executable:
// this is NOT a sandbox or a generic hostile-object serializer.
export function assertDataOnlyHostGraph(root) {
    const pending = [root], visited = new WeakSet();
    while (pending.length) {
        const value = pending.pop();
        if (typeof value === 'function')
            throw new Error('host metadata must contain data values');
        if (!value || typeof value !== 'object' || visited.has(value)) continue;
        visited.add(value);
        // JSON.stringify calls own toJSON even when it is non-enumerable.
        // Reject it before authority export can invoke host code.
        if (Object.hasOwn(value, 'toJSON'))
            throw new Error('host metadata must not define toJSON callbacks');
        if (value instanceof Date || value instanceof URL ||
            value instanceof RegExp || value instanceof ArrayBuffer ||
            ArrayBuffer.isView(value)) continue;
        if (hasNativeBufferBrand(value)) continue;
        if (value instanceof Map) {
            for (const [key, member] of Map.prototype.entries.call(value))
                pending.push(key, member);
            continue;
        }
        if (value instanceof Set) {
            for (const member of Set.prototype.values.call(value))
                pending.push(member);
            continue;
        }
        const prototype = Object.getPrototypeOf(value);
        if (!Array.isArray(value) && prototype !== Object.prototype &&
            prototype !== null)
            throw new Error('unsupported data-only host metadata prototype');
        for (const key of Reflect.ownKeys(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor?.enumerable) continue;
            if (!Object.hasOwn(descriptor, 'value'))
                throw new Error('host metadata must have own data properties');
            pending.push(descriptor.value);
        }
    }
}

// Known JSON numeric-loss case only, not an arbitrary host data serializer.
// Iteration instead of recursion bounds call-stack use for deeply nested
// valid custom objects. No references escape the validation call.
function assertFiniteNestedNumbers(root, errorMessage, dataOnly = false) {
    const pending = [root];
    const visited = new WeakSet();
    while (pending.length) {
        const value = pending.pop();
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new Error(errorMessage);
            continue;
        }
        if (!value || typeof value !== 'object' || visited.has(value)) continue;
        visited.add(value);
        // Invalid Date#toJSON returns null. This is the same silent numeric
        // loss as a nonfinite number in host event/cargo checkpoint metadata.
        if (value instanceof Date && !Number.isFinite(value.getTime()))
            throw new Error(errorMessage);
        if (dataOnly) {
            if (value instanceof Map) {
                for (const [key, child] of Map.prototype.entries.call(value))
                    pending.push(key, child);
            } else if (value instanceof Set) {
                for (const child of Set.prototype.values.call(value))
                    pending.push(child);
            } else if (!(value instanceof Date) && !(value instanceof URL) &&
                !(value instanceof RegExp) && !(value instanceof ArrayBuffer) &&
                !ArrayBuffer.isView(value)) {
                for (const key of Reflect.ownKeys(value)) {
                    const descriptor = Object.getOwnPropertyDescriptor(value, key);
                    if (descriptor?.enumerable && Object.hasOwn(descriptor, 'value'))
                        pending.push(descriptor.value);
                }
            }
        } else {
            for (const child of Object.values(value)) pending.push(child);
        }
    }
}

// Structural snapshot admission, not event provenance or checkpoint
// authentication. Events are append-only in the reference simulator;
// arbitrary host-defined types remain permitted, but a future, missing,
// out-of-order, or null tick cannot form a truthful snapshot timeline.
export function assertCivilizationEventJournal(events, tickCount, dataOnly = false) {
    if (!Array.isArray(events) || !Number.isSafeInteger(tickCount) || tickCount < 0)
        throw new Error('invalid simulation event journal');
    let previousTick = -1;
    for (let index = 0; index < events.length; index++) {
        if (!Object.hasOwn(events, index)) throw new Error('invalid simulation event journal');
        const event = events[index];
        if (event === null || typeof event !== 'object' || Array.isArray(event))
            throw new Error('invalid simulation event journal');
        if (dataOnly) assertDataOnlyHostGraph(event);
        const eventTick = dataOnly
            ? Object.getOwnPropertyDescriptor(event, 'tick')?.value
            : event?.tick;
        if (!Number.isSafeInteger(eventTick) || eventTick < previousTick ||
            eventTick > tickCount)
            throw new Error('invalid simulation event journal');
        previousTick = eventTick;
        // A nested NaN/Infinity would otherwise become null at the authority
        // JSON checkpoint boundary, even for a valid custom event name.
        assertFiniteNestedNumbers(event, 'invalid simulation event numeric payload', dataOnly);
    }
}

// Shared known fields: both the trusted snapshot boundary and the
// authoritative live tick must agree on cadence and danger history.
export function assertCivilizationCognitiveAndDangerState(state, allowNontradeLodFallback = false) {
    for (const route of state.routes) {
        // A host may deliberately mark a low-danger route BLOCKED.
        const danger = route.perceivedDanger;
        if (!Number.isFinite(danger) || danger < 0 || danger > 1 ||
            !Object.values(ROUTE_STATUS).includes(route.status) ||
            !Number.isSafeInteger(route.incidentCount) ||
            route.incidentCount < 0 ||
            (route.lastRaidTick !== null &&
                (!Number.isSafeInteger(route.lastRaidTick) ||
                    route.lastRaidTick < 0 || route.lastRaidTick > state.tickCount)))
            throw new Error('invalid civilization route danger history');
    }
    for (const entity of state.entities) {
        const invalidLod = !Number.isInteger(entity.lodTier) ||
            entity.lodTier < COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE ||
            entity.lodTier > COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN;
        if ((invalidLod && !(allowNontradeLodFallback &&
            !String(entity.id).startsWith('trade:'))) ||
            !Number.isFinite(entity.fear) || entity.fear < 0 || entity.fear > 1 ||
            !Number.isFinite(entity.morale) || entity.morale < 0 || entity.morale > 1 ||
            !Number.isSafeInteger(entity.lastLodChangeTick) ||
            entity.lastLodChangeTick < 0 ||
            entity.lastLodChangeTick > state.tickCount)
            throw new Error('invalid civilization cognitive state');
    }
}

// Snapshot replay must not admit malformed coordinates or numeric prices that
// JSON serialization changes (NaN/Infinity -> null). This validates only the
// reference simulator's known numeric fields, not host-defined metadata or
// the independently trusted road graph.
export function assertCivilizationReplayFields(state) {
    const position = value => value !== null && typeof value === 'object' &&
        !Array.isArray(value) && Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        (!Object.hasOwn(value, 'z') || Number.isFinite(value.z));
    if (!position(state.focusOrigin))
        throw new Error('invalid civilization position');
    for (const node of state.nodes) {
        if (!position(node.position))
            throw new Error('invalid civilization position');
        for (const quote of Object.values(node.market)) {
            if (quote === null || typeof quote !== 'object' || Array.isArray(quote))
                continue; // Custom scalar/null market entries remain supported.
            for (const key of ['buyPrice', 'sellPrice']) {
                if (Object.hasOwn(quote, key) &&
                    (typeof quote[key] !== 'number' ||
                        !Number.isFinite(quote[key]) || quote[key] < 0))
                    throw new Error('invalid civilization market quote');
            }
        }
    }
    for (const route of state.routes) {
        for (let i = 0; i < route.waypoints.length; i++) {
            if (!Object.hasOwn(route.waypoints, i) ||
                !position(route.waypoints[i]))
                throw new Error('invalid civilization waypoint coordinates');
        }
    }
    for (const entity of state.entities) {
        if (!position(entity.position))
            throw new Error('invalid civilization position');
        // Nontrade cargo is host-defined; do not impose shipment inventory
        // rules on it, only refuse silent nonfinite-to-null JSON conversion.
        assertFiniteNestedNumbers(entity.cargo,'invalid civilization cargo numeric metadata');
    }
    assertCivilizationCognitiveAndDangerState(state);
}

// Admission for this reference simulator's existing restore target, not a
// general transactional rollback. setState writes these fields and calls the
// three maps' clear/set methods; a host may replace any of them publicly.
export function assertCivilizationRestoreTarget(system) {
    if (!(system instanceof CivilizationSimulationSystem))
        throw new Error('invalid writable civilization restore target');
    for (const field of ['tickCount', 'focusOrigin', 'events']) {
        const descriptor = Object.getOwnPropertyDescriptor(system, field);
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.writable)
            throw new Error('invalid writable civilization restore target');
    }
    for (const field of ['nodes', 'routes', 'entities']) {
        const map = system[field];
        if (!(map instanceof Map) || map.clear !== Map.prototype.clear ||
            map.set !== Map.prototype.set)
            throw new Error('invalid writable civilization restore target');
    }
}

export class CivilizationSimulationSystem {
    /**
     * @param {object} [config={}]
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CIV_CONFIG, ...config };
        this.focusOrigin = { x: 0, y: 0, z: 0 };
        this.nodes = new Map();       // Map<nodeId, WorldNode>
        this.routes = new Map();      // Map<routeId, TradeRoute>
        this.entities = new Map();    // Map<entityId, SimEntity>
        this.tickCount = 0;
        this.events = [];
    }

    /**
     * Update focus point (e.g. camera, active player, or primary viewport)
     * @param {number} x
     * @param {number} y
     * @param {number} [z=0]
     */
    setFocusOrigin(x, y, z = 0) {
        this.focusOrigin = { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
    }

    /**
     * Register a settlement or waypoint node
     * @param {string} id
     * @param {object} nodeData
     * @returns {object} registered node
     */
    registerNode(id, {
        name = null,
        position = { x: 0, y: 0, z: 0 },
        factionId = null,
        market = {},
        garrison = 0.5
    } = {}) {
        if (!id) return null;
        const node = {
            id: String(id),
            name: name ? String(name) : String(id),
            position: {
                x: Number(position.x) || 0,
                y: Number(position.y) || 0,
                z: Number(position.z) || 0
            },
            factionId: factionId ? String(factionId) : null,
            market: { ...market },
            garrison: clamp01(garrison)
        };
        this.nodes.set(node.id, node);
        return node;
    }

    /**
     * Register a trade/travel route between two nodes
     * @param {string} id
     * @param {object} routeData
     * @returns {object} registered route
     */
    registerRoute(id, {
        fromNodeId,
        toNodeId,
        distance = 100,
        baseSecurity = 0.8,
        toll = 0.0,
        waypoints = []
    } = {}) {
        if (!id || !fromNodeId || !toNodeId) return null;
        const route = {
            id: String(id),
            fromNodeId: String(fromNodeId),
            toNodeId: String(toNodeId),
            // `|| 100` swallowed an explicit 0. Absent/non-finite falls back;
            // an explicit 0 reaches the Math.max(1, ...) floor intact.
            distance: Math.max(1, Number.isFinite(Number(distance)) ? Number(distance) : 100),
            baseSecurity: clamp01(baseSecurity),
            toll: Math.max(0, Number(toll) || 0),
            waypoints: Array.isArray(waypoints) ? [...waypoints] : [],
            perceivedDanger: clamp01(1.0 - baseSecurity),
            incidentCount: 0,
            status: ROUTE_STATUS.SAFE,
            lastRaidTick: null
        };
        this._updateRouteStatus(route);
        this.routes.set(route.id, route);
        return route;
    }

    /**
     * Register an agent or group entity into the civilization simulation
     * @param {string} id
     * @param {object} entityData
     * @returns {object} registered entity
     */
    registerEntity(id, {
        type = 'CARAVAN',
        factionId = null,
        position = { x: 0, y: 0, z: 0 },
        cargo = {},
        wealth = 100,
        fear = 0.0,
        morale = 1.0,
        currentRouteId = null,
        routeProgress = 0.0
    } = {}) {
        if (!id) return null;
        const entity = {
            id: String(id),
            type: String(type),
            factionId: factionId ? String(factionId) : null,
            position: {
                x: Number(position.x) || 0,
                y: Number(position.y) || 0,
                z: Number(position.z) || 0
            },
            cargo: { ...cargo },
            wealth: Number(wealth) || 0,
            fear: clamp01(fear),
            morale: clamp01(morale),
            currentRouteId: currentRouteId ? String(currentRouteId) : null,
            routeProgress: clamp01(routeProgress),
            lodTier: COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE,
            lastLodChangeTick: this.tickCount,
            lastUpdateTick: this.tickCount
        };
        this._evaluateEntityLOD(entity);
        this.entities.set(entity.id, entity);
        return entity;
    }

    /**
     * Update all entity LOD tiers based on spatial distance to focus point
     * Enforces the State Continuity Invariant across tier changes
     * @returns {object} report of LOD counts and transitions
     */
    updateLODTiers() {
        const counts = {
            [COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE]: 0,
            [COGNITIVE_LOD_TIERS.LOD1_TACTICAL]: 0,
            [COGNITIVE_LOD_TIERS.LOD2_REGIONAL]: 0,
            [COGNITIVE_LOD_TIERS.LOD3_MACRO_ROUTE]: 0,
            [COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN]: 0
        };
        const transitions = [];

        for (const entity of this.entities.values()) {
            const prevTier = entity.lodTier;
            this._evaluateEntityLOD(entity);
            counts[entity.lodTier]++;

            if (entity.lodTier !== prevTier) {
                transitions.push({
                    entityId: entity.id,
                    fromTier: prevTier,
                    toTier: entity.lodTier,
                    // Preserve continuity of fear, morale, and wealth
                    fear: entity.fear,
                    morale: entity.morale
                });
                entity.lastLodChangeTick = this.tickCount;
            }
        }

        return { counts, transitions };
    }

    /**
     * Private helper to determine LOD tier based on distance
     */
    _evaluateEntityLOD(entity) {
        const dx = entity.position.x - this.focusOrigin.x;
        const dy = entity.position.y - this.focusOrigin.y;
        const dz = (entity.position.z || 0) - (this.focusOrigin.z || 0);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const { immediate, tactical, regional, macroRoute } = this.config.lodThresholds;

        if (dist < immediate) {
            entity.lodTier = COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE;
        } else if (dist < tactical) {
            entity.lodTier = COGNITIVE_LOD_TIERS.LOD1_TACTICAL;
        } else if (dist < regional) {
            entity.lodTier = COGNITIVE_LOD_TIERS.LOD2_REGIONAL;
        } else if (dist < macroRoute) {
            entity.lodTier = COGNITIVE_LOD_TIERS.LOD3_MACRO_ROUTE;
        } else {
            entity.lodTier = COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN;
        }
    }

    /**
     * Record an incident along a route (e.g. bandit ambush or beast attack)
     * Spikes route perceived danger and alters route status
     * @param {string} routeId
     * @param {string} incidentType
     * @param {number} [severity=0.5]
     */
    recordRouteIncident(routeId, incidentType, severity = 0.5) {
        const route = this.routes.get(routeId);
        if (!route) return;

        route.incidentCount++;
        route.lastRaidTick = this.tickCount;
        route.perceivedDanger = clamp01(route.perceivedDanger + Number(severity));
        this._updateRouteStatus(route);
    }

    /**
     * Private helper to update route status based on perceived danger
     */
    _updateRouteStatus(route) {
        if (route.perceivedDanger >= 0.75) {
            route.status = ROUTE_STATUS.BLOCKED;
        } else if (route.perceivedDanger >= 0.50) {
            route.status = ROUTE_STATUS.CONTESTED;
        } else if (route.perceivedDanger >= 0.25) {
            route.status = ROUTE_STATUS.WATCHFUL;
        } else {
            route.status = ROUTE_STATUS.SAFE;
        }
    }

    /**
     * Rank available trade routes between two nodes based on profit, danger, toll, and distance
     * Allows dynamic danger rerouting around blocked or contested corridors
     * @param {string} fromNodeId
     * @param {string} toNodeId
     * @param {string} commodity
     * @param {number} [riskTolerance=0.5]
     * @returns {Array<object>} ranked routes with utility breakdown
     */
    rankTradeRoutes(fromNodeId, toNodeId, commodity = COMMODITY_TYPES.FOOD, riskTolerance = 0.5) {
        const candidateRoutes = [];
        for (const route of this.routes.values()) {
            if (
                (route.fromNodeId === fromNodeId && route.toNodeId === toNodeId) ||
                (route.fromNodeId === toNodeId && route.toNodeId === fromNodeId)
            ) {
                candidateRoutes.push(route);
            }
        }

        const sourceNode = this.nodes.get(fromNodeId);
        const targetNode = this.nodes.get(toNodeId);
        const supplyPrice = sourceNode?.market?.[commodity]?.sellPrice ?? 10;
        const demandPrice = targetNode?.market?.[commodity]?.buyPrice ?? 25;
        const grossProfit = Math.max(0, demandPrice - supplyPrice);

        const evaluated = candidateRoutes.map(route => {
            // Normalized considerations
            const normDist = clamp01(route.distance / 500); // 500m baseline
            const dangerWeight = 1.0 - clamp01(riskTolerance);
            const dangerPenalty = route.perceivedDanger * dangerWeight * 1.5;
            const tollPenalty = clamp01(route.toll / 50);

            // Utility U = Profit - Danger - Toll - Distance
            const normProfit = clamp01(grossProfit / 50);
            const utility = normProfit - dangerPenalty - (normDist * 0.3) - (tollPenalty * 0.2);

            return {
                routeId: route.id,
                status: route.status,
                distance: route.distance,
                perceivedDanger: route.perceivedDanger,
                grossProfit,
                utility,
                recommended: route.status !== ROUTE_STATUS.BLOCKED && utility > 0.0
            };
        });

        // Sort by utility descending
        evaluated.sort((a, b) => b.utility - a.utility);
        return evaluated;
    }

    /**
     * Advance simulation by deltaTicks
     * Executes tiered updates according to LOD cadences
     * @param {number} [deltaTicks=1]
     * @param {object} [context={}]
     * @returns {object} tick execution summary
     */
    advanceSimulation(deltaTicks = 1, context = {}) {
        this.tickCount += deltaTicks;

        // 1. Decay route danger over time
        const dangerDecay = 1.0 - Math.pow(2, -deltaTicks / this.config.routeDangerHalfLifeTicks);
        for (const route of this.routes.values()) {
            const minDanger = 1.0 - route.baseSecurity;
            if (route.perceivedDanger > minDanger) {
                route.perceivedDanger = clamp01(minDanger + (route.perceivedDanger - minDanger) * (1.0 - dangerDecay));
                this._updateRouteStatus(route);
            }
        }

        // 2. Advance entities according to their LOD cadence
        let updatedCount = 0;
        const arrivalIntents = [];
        for (const entity of this.entities.values()) {
            const cadence = LOD_CADENCES[entity.lodTier] || 1;
            const ticksSinceLast = this.tickCount - entity.lastUpdateTick;

            if (ticksSinceLast >= cadence) {
                entity.lastUpdateTick = this.tickCount;
                updatedCount++;

                // If entity is traversing a route, advance its progress
                if (entity.currentRouteId) {
                    const route = this.routes.get(entity.currentRouteId);
                    if (route) {
                        // Travel speed influenced by fear and terrain
                        if (this.config.distanceAwareTravel === true && entity.type === 'CARAVAN') {
                            const units = Number(this.config.caravanUnitsPerTick);
                            if (!Number.isFinite(units) || units <= 0) {
                                throw new Error('distance-aware caravan speed must be positive and finite');
                            }
                            if (!Number.isFinite(route.distance) || route.distance <= 0) {
                                throw new Error('caravan road distance must be positive and finite');
                            }
                            if (route.status !== ROUTE_STATUS.BLOCKED) {
                                const delta = units * ticksSinceLast * (entity.fear > 0.6 ? 1.4 : 1.0) / route.distance;
                                entity.routeProgress = clamp01(entity.routeProgress + delta);
                                if (entity.routeProgress >= 1.0) {
                                    // An intent, NOT an inventory transfer. Host must commit cargo atomically.
                                    const intent = { type: 'caravan_arrival_intent', tick: this.tickCount,
                                        entityId: entity.id, routeId: route.id, targetNodeId: route.toNodeId,
                                        cargo: { ...entity.cargo } };
                                    arrivalIntents.push(intent);
                                    this.events.push(intent);
                                    entity.currentRouteId = null; // exactly once, including after save/restore
                                }
                            }
                        } else {
                            const speed = 0.01 * cadence * (entity.fear > 0.6 ? 1.4 : 1.0);
                            entity.routeProgress = clamp01(entity.routeProgress + speed);
                        }

                        // If route has high danger, fear rises
                        if (route.perceivedDanger > 0.5) {
                            entity.fear = clamp01(entity.fear + 0.02 * route.perceivedDanger);
                        } else {
                            entity.fear = clamp01(entity.fear - 0.01 * cadence);
                        }
                    }
                }
            }
        }

        return {
            tickCount: this.tickCount,
            updatedEntityCount: updatedCount,
            totalEntityCount: this.entities.size,
            arrivalIntents
        };
    }

    /**
     * Capture the direct simulator state. dataOnlyHostMetadata=true opts in
     * to rejecting enumerable accessors in ordinary event/nontrade cargo
     * metadata before reading them; it is not a Proxy sandbox or a guarantee
     * about caller-defined hooks in other world fields or authority JSON.
     * @param {{dataOnlyHostMetadata?: boolean}} [options]
     * @returns {object}
     */
    getState(options = {}) {
        const dataOnly = options?.dataOnlyHostMetadata === true;
        assertCivilizationEventJournal(this.events, this.tickCount, dataOnly);
        if (dataOnly) {
            for (const entity of this.entities.values()) {
                const cargo = Object.getOwnPropertyDescriptor(entity, 'cargo');
                if (!cargo || !Object.hasOwn(cargo, 'value'))
                    throw new Error('host metadata must have own data properties');
                assertDataOnlyHostGraph(cargo.value);
            }
        }
        // Use one transient memo across event and nontrade cargo roots: a
        // shared host object must remain one detached object *within* a direct
        // snapshot. The JSON authority checkpoint intentionally cannot encode
        // reference identity and continues to make its own independent clone.
        const hostCopies = new WeakMap();
        const snapshot = {
            tickCount: this.tickCount,
            focusOrigin: { ...this.focusOrigin },
            nodes: Array.from(this.nodes.values()).map(n => ({
                ...n,
                position: { ...n.position },
                // Market commodity records may contain nested host metadata.
                // Snapshots must not retain aliases to live market contents.
                market: structuredClone(n.market)
            })),
            events: this.events.map(e => {
                const event = cloneHostSnapshotMetadata(e, hostCopies, dataOnly);
                const cargo = dataOnly
                    ? Object.getOwnPropertyDescriptor(e, 'cargo')?.value
                    : e.cargo;
                if (!cargo) event.cargo = undefined;
                return event;
            }),
            routes: Array.from(this.routes.values()).map(r => ({
                ...r,
                // Array spread alone retains live waypoint object references.
                waypoints: structuredClone(r.waypoints)
            })),
            entities: Array.from(this.entities.values()).map(e => ({
                ...e,
                position: { ...e.position },
                cargo: cloneHostSnapshotMetadata(dataOnly
                    ? (Object.getOwnPropertyDescriptor(e, 'cargo')?.value ?? {})
                    : (e.cargo ?? {}), hostCopies, dataOnly)
            }))
        };
        assertCivilizationReplayFields(snapshot);
        return snapshot;
    }

    /**
     * Restore direct state. The opt-in data-only preflight happens before
     * state writes, but does not replace trusted checkpoint admission.
     * @param {object} snapshot
     * @param {{dataOnlyHostMetadata?: boolean}} [options]
     */
    setState(snapshot, options = {}) {
        if (!snapshot) return;
        const dataOnly = options?.dataOnlyHostMetadata === true;
        if (dataOnly) {
            for (const event of snapshot.events ?? []) {
                if (!event || typeof event !== 'object' || Array.isArray(event))
                    throw new Error('invalid data-only simulation event');
                assertDataOnlyHostGraph(event);
            }
            for (const entity of snapshot.entities ?? []) {
                if (!entity || typeof entity !== 'object')
                    throw new Error('invalid data-only simulation entity');
                const cargo = Object.getOwnPropertyDescriptor(entity, 'cargo');
                if (!cargo || !Object.hasOwn(cargo, 'value'))
                    throw new Error('host metadata must have own data properties');
                assertDataOnlyHostGraph(cargo.value);
            }
        }
        // Incoming direct snapshot roots may share host-owned metadata. Keep
        // their identity within the restored world, but no caller references.
        const hostCopies = new WeakMap();
        // In opt-in data-only mode, stage every host event/cargo copy before
        // the first world write. Unsupported native buffers can otherwise
        // throw halfway through clearing/rebuilding destination state.
        // This does not roll back arbitrary host callbacks or unrelated fields.
        const stagedEvents = dataOnly && Array.isArray(snapshot.events)
            ? snapshot.events.map(e => {
                const event = cloneHostSnapshotMetadata(e, hostCopies, true);
                if (!Object.getOwnPropertyDescriptor(e, 'cargo')?.value)
                    event.cargo = undefined;
                return event;
            }) : null;
        const stagedCargo = dataOnly && Array.isArray(snapshot.entities)
            ? snapshot.entities.map(e => cloneHostSnapshotMetadata(
                Object.getOwnPropertyDescriptor(e, 'cargo')?.value ?? {},
                hostCopies, true)) : null;
        this.tickCount = Number(snapshot.tickCount) || 0;
        this.focusOrigin = snapshot.focusOrigin ? { ...snapshot.focusOrigin } : { x: 0, y: 0, z: 0 };
        this.nodes.clear();
        this.routes.clear();
        this.entities.clear();
        this.events = stagedEvents ?? (Array.isArray(snapshot.events)
            ? snapshot.events.map(e => {
                const event = cloneHostSnapshotMetadata(e, hostCopies, dataOnly);
                const cargo = dataOnly
                    ? Object.getOwnPropertyDescriptor(e, 'cargo')?.value
                    : e.cargo;
                if (!cargo) event.cargo = undefined;
                return event;
            })
            : []);

        if (Array.isArray(snapshot.nodes)) {
            for (const n of snapshot.nodes) {
                if (!n || !n.id) continue;
                this.nodes.set(n.id, {
                    ...n,
                    position: { ...n.position },
                    market: structuredClone(n.market)
                });
            }
        }

        if (Array.isArray(snapshot.routes)) {
            for (const r of snapshot.routes) {
                if (!r || !r.id) continue;
                this.routes.set(r.id, {
                    ...r,
                    waypoints: Array.isArray(r.waypoints) ? structuredClone(r.waypoints) : []
                });
            }
        }

        if (Array.isArray(snapshot.entities)) {
            for (const [index, e] of snapshot.entities.entries()) {
                if (!e || !e.id) continue;
                this.entities.set(e.id, {
                    ...e,
                    position: { ...e.position },
                    cargo: stagedCargo
                        ? stagedCargo[index]
                        : cloneHostSnapshotMetadata(e.cargo ?? {}, hostCopies)
                });
            }
        }
    }
}

export default CivilizationSimulationSystem;
