// factionrelationship.js
//
// World-Scale Living-Systems Constitution §395 (Faction Relationship Vector MVP)
// and §396 (Escalation MVP). This module is the breadth-slice deliverable for
// the §529 "WORLD CONTACT" milestone.
//
// The relationship vector is a per-pair (A, B) state that aggregates the
// signals the §20 hostility-pressure model cares about. It is intentionally
// minimal: trust, grievance, fear, tradeDependency, territorialPressure.
//
// The stance ladder is a discrete state machine with hysteresis (§23):
// hostile is entered on one threshold, exited on a lower threshold, so
// a passive faction does not bounce between PEACE and WAR every tick.

const STANCE_STAY_TOLERANT = 0;
const STANCE_WATCHFUL = 1;
const STANCE_DEFENSIVE = 2;
const STANCE_HOSTILE = 3;
const STANCE_MOBILIZING = 4;
const STANCE_LIMITED_CONFLICT = 5;
const STANCE_WAR = 6;
const STANCE_CEASEFIRE = 7;

export const StanceLadder = Object.freeze({
    TOLERANT: STANCE_STAY_TOLERANT,
    WATCHFUL: STANCE_WATCHFUL,
    DEFENSIVE: STANCE_DEFENSIVE,
    HOSTILE: STANCE_HOSTILE,
    MOBILIZING: STANCE_MOBILIZING,
    LIMITED_CONFLICT: STANCE_LIMITED_CONFLICT,
    WAR: STANCE_WAR,
    CEASEFIRE: STANCE_CEASEFIRE,
});

// Thresholds for the stance ladder. Pressure is a normalized scalar
// derived from the relationship vector. The values are documented and
// calibratable; they are NOT research-grounded defaults (Constitution §145).
const DEFAULT_THRESHOLDS = Object.freeze({
    // Escalation: enter a new stance when pressure >= threshold.
    watchful: 0.35,
    defensive: 0.5,
    hostile: 0.65,
    mobilizing: 0.75,
    limitedConflict: 0.85,
    war: 0.95,
    // De-escalation: leave a stance when pressure < threshold.
    // Each calm threshold is below the corresponding attack threshold
    // (§23 hysteresis requirement).
    calmFromWatchful: 0.25,
    calmFromDefensive: 0.4,
    calmFromHostile: 0.55,
    calmFromMobilizing: 0.65,
    calmFromLimitedConflict: 0.75,
    calmFromWar: 0.85,
});

// Trust dampens pressure. §20: trust subtracts from the hostility pressure.
const TRUST_DAMPING = 0.5;

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export class FactionRelationshipVector {
    constructor({
        id,
        trust = 0.5,
        grievance = 0,
        fear = 0,
        tradeDependency = 0,
        territorialPressure = 0,
        decay = 0.05,
    } = {}) {
        this.id = id;
        // The audit's P1 #1: the legacy `trust` field is no
        // longer an independently writable source of
        // truth. It is now derived as the mean of the
        // directed trust map (the §15 "A → B ≠ B → A"
        // contract). Producers that previously wrote
        // `vector.trust = X` must instead call
        // `vector.setTrustFrom(perspective, X)`. The
        // `getTrustFrom(perspective)` method returns the
        // directed value, falling back to the derived
        // symmetric mean if the perspective has not been
        // explicitly set.
        this._grievanceSeed = clamp01(grievance);
        this._fearSeed = clamp01(fear);
        this._territorialPressureSeed = clamp01(territorialPressure);
        this.tradeDependency = clamp01(tradeDependency);
        // Decay is per-advance (per-tick) multiplicative on pressure and fear.
        this.decay = decay;
        this.events = [];
        // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE:
        // directional state for the three pressure
        // components (territorial pressure, grievance,
        // fear). Keys are observer faction ids; values are
        // the *observer's* view of the relationship
        // component. The legacy `territorialPressure`,
        // `grievance`, `fear` fields remain *derived* (mean
        // across observers) and the setters throw (mirror
        // the `trust` setter at lines 156-162). This is
        // the audit's debt #3 contract, finally delivered
        // in the territory slice.
        this.directedTerritorialPressure = Object.create(null);
        this.directedGrievance = Object.create(null);
        this.directedFear = Object.create(null);
        // The constructor's `territorialPressure` /
        // `grievance` / `fear` arguments are stored in
        // the `_XxxSeed` fields above; the legacy
        // derived getter returns the seed when no
        // directed perspectives have been recorded.
        // We intentionally do NOT seed the
        // `*default*` perspective here — that would
        // pollute the directional mean (e.g. mean({0,
        // 0.4, 0.8}) ≠ mean({0.4, 0.8})). The strict
        // directional contract is what the audit
        // requires.
        // Constitution §15 "A → B is not necessarily equal to B → A":
        // directed trust per perspective. Keys are
        // participant ids (the two factions in the pair);
        // values are the trust *from* that perspective
        // toward the other. This is the audit's
        // authoritative source of truth — the legacy
        // symmetric `trust` is derived from this map.
        this.directedTrust = {};
        // Seed the directed trust from the constructor's
        // `trust` value (the symmetric default). We set it
        // for both participants if the vector's id parses
        // as a pair ("a::b"); otherwise we set the
        // perspective for the caller (e.g. a single
        // participant). The seed uses the participant id
        // "*self*" as a special key that means "the
        // perspective is unspecified, fall back to the
        // symmetric default."
        if (id && typeof id === 'string' && id.includes('::')) {
            const [a, b] = id.split('::');
            if (a) this.directedTrust[a] = clamp01(trust);
            if (b) this.directedTrust[b] = clamp01(trust);
        } else {
            this.directedTrust['*default*'] = clamp01(trust);
        }
        // Slice EVID-2026-08-28-PERSPECTIVE-AWARE-CHOOSE-STANCE-LIVE:
        // per-perspective stance memory so A→B and B→A
        // can hold independent stance values. The
        // symmetric `stance` field is the *most recent*
        // observation across all perspectives (kept
        // updated for backwards compatibility); the
        // directional read goes through
        // `stanceFrom(fromFactionId)`. We do NOT seed
        // any perspective here so the first observation
        // fires a STANCE_OBSERVATION event (the audit
        // trail must show the transition from
        // "unobserved" to the first stance).
        this._stanceFrom = Object.create(null);
    }

    /**
     * Derived symmetric trust: the mean of the directed
     * trust map. Used by `pressure()` and `explain()` for
     * damping. This is a *derived* view; the
     * authoritative source of truth is `directedTrust`.
     *
     * The audit's P1 #1 requirement: a write to `trust`
     * must NOT mutate the directed map. We enforce this
     * by making `trust` a getter-only accessor. The
     * matching setter throws so any attempt to write
     * `vector.trust = X` fails loudly rather than
     * silently desyncing the two sources of truth.
     */
    get trust() {
        const values = Object.values(this.directedTrust);
        if (values.length === 0) return 0.5; // symmetric default
        let sum = 0;
        for (const v of values) sum += clamp01(v);
        return sum / values.length;
    }

    set trust(_value) {
        throw new TypeError(
            'FactionRelationshipVector.trust is a derived view; the ' +
            'authoritative source of truth is `directedTrust`. Use ' +
            '`setTrustFrom(perspectiveFactionId, value)` instead.'
        );
    }

    /**
     * Get the trust value *from* a specific perspective.
     * If the perspective has not been set, returns the
     * legacy `trust` field as a fallback (the symmetric
     * default). This is the §15 "A → B is not necessarily
     * equal to B → A" contract.
     *
     * @param {string} fromFactionId
     * @returns {number} trust value in [0, 1]
     */
    getTrustFrom(fromFactionId) {
        if (!fromFactionId) return this.trust;
        if (Object.prototype.hasOwnProperty.call(this.directedTrust, fromFactionId)) {
            return this.directedTrust[fromFactionId];
        }
        return this.trust;
    }

    /**
     * Set the trust value *from* a specific perspective.
     * The value is clamped to [0, 1] per §395. The legacy
     * `trust` field is NOT auto-updated — the caller can
     * derive it from the directed map if desired.
     *
     * @param {string} fromFactionId
     * @param {number} value
     */
    setTrustFrom(fromFactionId, value) {
        if (!fromFactionId) return;
        this.directedTrust[fromFactionId] = clamp01(value);
    }

    // ------------------------------------------------------------------
    // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: per-perspective
    // accessors for the three pressure components (territorial
    // pressure, grievance, fear). These mirror getTrustFrom /
    // setTrustFrom and the audit's debt #3 contract: A → B ≠ B → A.
    // ------------------------------------------------------------------

    /**
     * Get the territorial-pressure value *from* a specific
     * observer perspective. Falls back to the derived
     * symmetric mean if the perspective has not been set.
     */
    getTerritorialPressureFrom(fromFactionId) {
        if (!fromFactionId) return this.territorialPressure;
        if (Object.prototype.hasOwnProperty.call(this.directedTerritorialPressure, fromFactionId)) {
            return this.directedTerritorialPressure[fromFactionId];
        }
        // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: an
        // unobserved perspective returns 0 (no observation =
        // no evidence of pressure). This is the strict
        // directional contract the audit's debt #3
        // acceptance test requires. The trust pattern is
        // different because trust has a natural baseline.
        return 0;
    }

    setTerritorialPressureFrom(fromFactionId, value) {
        if (!fromFactionId) return;
        this.directedTerritorialPressure[fromFactionId] = clamp01(value);
        // Keep the seed in sync so the legacy derived
        // getter stays accurate when other perspectives
        // have not been set explicitly.
        if (fromFactionId === '*default*') {
            this._territorialPressureSeed = clamp01(value);
        }
    }

    getGrievanceFrom(fromFactionId) {
        if (!fromFactionId) return this.grievance;
        if (Object.prototype.hasOwnProperty.call(this.directedGrievance, fromFactionId)) {
            return this.directedGrievance[fromFactionId];
        }
        return 0;
    }

    setGrievanceFrom(fromFactionId, value) {
        if (!fromFactionId) return;
        this.directedGrievance[fromFactionId] = clamp01(value);
        if (fromFactionId === '*default*') {
            this._grievanceSeed = clamp01(value);
        }
    }

    getFearFrom(fromFactionId) {
        if (!fromFactionId) return this.fear;
        if (Object.prototype.hasOwnProperty.call(this.directedFear, fromFactionId)) {
            return this.directedFear[fromFactionId];
        }
        return 0;
    }

    setFearFrom(fromFactionId, value) {
        if (!fromFactionId) return;
        this.directedFear[fromFactionId] = clamp01(value);
        if (fromFactionId === '*default*') {
            this._fearSeed = clamp01(value);
        }
    }

    /**
     * Count the number of events of `eventType` in the audit
     * trail whose `tick` is in `[tick - window, tick]`. The
     * default window is 50 ticks. Used by the territory pass
     * to compute `previousIncidentsCount` for `chooseStance`.
     */
    eventCount(eventType, tick = 0, window = 50) {
        if (!this.events) return 0;
        let count = 0;
        for (const ev of this.events) {
            if (ev.type !== eventType) continue;
            if (ev.tick !== undefined && Math.abs(ev.tick - tick) > window) continue;
            count += 1;
        }
        return count;
    }

    /**
     * Count intrusion events in the recent window, optionally
     * filtered by a specific intruder id.
     */
    intrusionCount(tick = 0, window = 50, intruderId = null) {
        if (!this.events) return 0;
        let count = 0;
        for (const ev of this.events) {
            if (ev.type !== 'INTRUSION') continue;
            if (ev.tick !== undefined && Math.abs(ev.tick - tick) > window) continue;
            if (intruderId !== null && ev.intruderId !== intruderId) continue;
            count += 1;
        }
        return count;
    }

    /**
     * Return the largest `groupSize` recorded on any
     * intrusion event in the recent window, optionally
     * filtered by observer perspective. Used by
     * `chooseStance`'s `perceivedGroupSize` input.
     */
    lastObservedGroupSizeFrom(fromFactionId, tick = 0, window = 50) {
        if (!this.events) return 0;
        let maxGroup = 0;
        for (const ev of this.events) {
            if (ev.type !== 'INTRUSION') continue;
            if (ev.observerId && fromFactionId && ev.observerId !== fromFactionId) continue;
            if (ev.tick !== undefined && Math.abs(ev.tick - tick) > window) continue;
            const g = ev.context?.groupSize;
            if (Number.isFinite(g) && g > maxGroup) maxGroup = g;
        }
        return maxGroup;
    }

    recordTrespass({ severity = 0.3, tick = 0, fromFactionId = null } = {}) {
        const s = clamp01(severity);
        // Territorial pressure accumulates the trespass; a small portion
        // also seeps into grievance (§20: grievance is one input to
        // hostility pressure, separate from territorial pressure itself).
        // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: write through
        // the seed (the legacy derived field is now a getter). The
        // `*default*` key is the canonical symmetric-default slot.
        const tPress = clamp01(this.getTerritorialPressureFrom('*default*') + s * 0.4);
        this.setTerritorialPressureFrom('*default*', tPress);
        const gr = clamp01(this.getGrievanceFrom('*default*') + s * 0.2);
        this.setGrievanceFrom('*default*', gr);
        // If a `fromFactionId` is provided and it differs
        // from the vector's primary perspective (we can't
        // tell from here — the caller passes a `fromFactionId`
        // which represents *who* is trespassing), the
        // directed trust from the *victim* perspective is
        // debited. The convention: a `fromFactionId` here
        // is the *source* of the trespass; the vector's
        // directed trust for the source perspective is
        // debited (the source's view of the relationship
        // is what we model — the source is the actor whose
        // trust we are tracking).
        if (fromFactionId) {
            const prev = this.getTrustFrom(fromFactionId);
            this.setTrustFrom(fromFactionId, prev - s * 0.1);
        }
        this.events.push({ type: 'TRESPASS', tick, severity: s, fromFactionId });
    }

    /**
     * Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: the
     * directional intrusion writer. Replaces `recordTrespass`
     * for territory-driven flows.
     *
     * The `observerFactionId` is the faction that LEGALLY
     * observed the intrusion (passed the `canObserveTerritory`
     * predicate). The `fromFactionId` is the *intruder*'s
     * faction. The severity is scaled by the contextual
     * inputs:
     *   groupSize                 (50 strangers ≠ 1 traveler)
     *   armedStatus               (a warband ≠ a peddler)
     *   scarceResourceOccupancy   (occupying the well ≠ passing through)
     *   priorIncidents            (5th time this month ≠ first)
     *   duration                  (a camp ≠ a passerby)
     *
     * The scaled severity is written to the OBSERVER's
     * perspective of:
     *   directedTerritorialPressure (weight 0.4)
     *   directedGrievance           (weight 0.2)
     *   directedFear                (weight 0.15)
     *
     * The legacy `territorialPressure` / `grievance` / `fear`
     * fields are kept in sync (the OBSERVER's value, since
     * the legacy view is a derived read of one perspective).
     * A note: in the symmetric-fallback case the legacy
     * view drifts from the directed mean; that's the
     * expected behaviour (the legacy view is *one*
     * observer's view, by convention the most-recent
     * writer). Callers that need a true symmetric mean
     * should call `pressureFrom(id)` per perspective.
     */
    recordIntrusion({
        observerFactionId = null,
        fromFactionId = null,
        severity = 0.3,
        groupSize = 1,
        armedStatus = 0,
        scarceResourceOccupancy = 0,
        priorIncidents = 0,
        duration = 1,
        location = null,
        tick = 0,
    } = {}) {
        const s = clamp01(severity);
        const scale = clamp01(
            s
            * Math.min(1, (Number.isFinite(groupSize) ? groupSize : 1) / 5)
            * (1 + 0.3 * clamp01(armedStatus))
            * (1 + 0.5 * clamp01(scarceResourceOccupancy))
            * (1 + 0.2 * Math.max(0, priorIncidents))
            * (1 + 0.1 * Math.max(0, (Number.isFinite(duration) ? duration : 1) - 1))
        );
        const observer = observerFactionId || '*default*';
        if (observerFactionId) {
            // Write to the directed maps.
            this.directedTerritorialPressure[observerFactionId] = clamp01(
                this.getTerritorialPressureFrom(observerFactionId) + scale * 0.4
            );
            this.directedGrievance[observerFactionId] = clamp01(
                this.getGrievanceFrom(observerFactionId) + scale * 0.2
            );
            this.directedFear[observerFactionId] = clamp01(
                this.getFearFrom(observerFactionId) + scale * 0.15
            );
            // Keep the legacy view in sync with the observer
            // perspective (the legacy view is "the perspective
            // of the most-recent writer"; the directed map
            // is the authoritative source of truth). The
            // legacy fields are derived getters, so we keep
            // the seed in sync rather than writing through
            // the setter (which would throw).
            this._territorialPressureSeed = this.directedTerritorialPressure[observerFactionId];
            this._grievanceSeed = this.directedGrievance[observerFactionId];
            this._fearSeed = this.directedFear[observerFactionId];
        } else {
            // No observer — write the legacy symmetric view
            // through the seed (the legacy field is a derived
            // getter; direct writes throw).
            this._territorialPressureSeed = clamp01(this._territorialPressureSeed + scale * 0.4);
            this._grievanceSeed = clamp01(this._grievanceSeed + scale * 0.2);
            this._fearSeed = clamp01(this._fearSeed + scale * 0.15);
        }
        // Intruder trust: debit the source's directed trust
        // (the source's view of the relationship is what we
        // model).
        if (fromFactionId) {
            const prev = this.getTrustFrom(fromFactionId);
            this.setTrustFrom(fromFactionId, prev - scale * 0.1);
        }
        const event = {
            type: 'INTRUSION',
            tick,
            observerId: observerFactionId,
            fromFactionId,
            severity: s,
            scaledSeverity: scale,
            context: {
                groupSize: Number.isFinite(groupSize) ? groupSize : 1,
                armedStatus: clamp01(armedStatus),
                scarceResourceOccupancy: clamp01(scarceResourceOccupancy),
                priorIncidents: Math.max(0, priorIncidents),
                duration: Number.isFinite(duration) ? duration : 1,
                location,
            },
        };
        this.events.push(event);
        return event;
    }

    recordTrade({ value = 0.1, tick = 0, fromFactionId = null } = {}) {
        // §184: repeated fair trade can build trust. We treat a single
        // trade event as a small positive nudge.
        const v = clamp01(value);
        this.tradeDependency = clamp01(this.tradeDependency + v * 0.3);
        // The audit's P1 #1: trust is no longer written
        // directly. The directed trust map is the
        // authoritative source of truth. If the caller
        // provides a `fromFactionId`, we credit that
        // perspective's directed trust. If not, we
        // credit all perspectives (the symmetric default).
        if (fromFactionId) {
            const prev = this.getTrustFrom(fromFactionId);
            this.setTrustFrom(fromFactionId, prev + v * 0.1);
        } else {
            for (const k of Object.keys(this.directedTrust)) {
                this.setTrustFrom(k, this.directedTrust[k] + v * 0.1);
            }
        }
        this.events.push({ type: 'TRADE', tick, value: v, fromFactionId });
    }

    recordHarm({ severity = 0.3, tick = 0, fromFactionId = null } = {}) {
        const s = clamp01(severity);
        // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: write through
        // the seed (the legacy derived field is now a getter).
        const gr = clamp01(this.getGrievanceFrom('*default*') + s * 0.5);
        this.setGrievanceFrom('*default*', gr);
        const f = clamp01(this.getFearFrom('*default*') + s * 0.3);
        this.setFearFrom('*default*', f);
        // The §15 contract: if the harm is caused by a
        // specific source faction, the directed trust
        // from the *victim* perspective is debited. But
        // since the vector is shared between both
        // factions' maps, the cleanest convention is:
        // `fromFactionId` is the *source* of the harm;
        // the directed trust from the *other* perspective
        // (the victim) is debited. To find the victim, we
        // look at the vector's `id` (e.g. 'a::b') and
        // debit the trust of the perspective that is NOT
        // the source. For simplicity in this slice, we
        // debit the trust of the perspective matching the
        // source's *counterpart* — i.e. if fromFactionId
        // is 'a', the directed trust of the *other*
        // participant ('b') is debited. The vector's
        // `id` is the source of truth for the pair.
        if (fromFactionId) {
            const pair = String(this.id).split('::');
            const otherId = pair.find(p => p && p !== fromFactionId);
            if (otherId) {
                const prev = this.getTrustFrom(otherId);
                this.setTrustFrom(otherId, prev - s * 0.1);
            }
        }
        this.events.push({ type: 'HARM', tick, severity: s, fromFactionId });
    }

    advance(tick = 0, { newEvents = [] } = {}) {
        // Multiplicative decay of pressure and fear (§23: terror lingers
        // but eventually fades without new stimulus).
        // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: decay the
        // directed maps AND the seed so the legacy derived view stays
        // consistent. (The mean of a decayed set equals the decayed
        // mean, so we decay each perspective individually.)
        for (const key of Object.keys(this.directedTerritorialPressure)) {
            this.directedTerritorialPressure[key] = clamp01(
                this.directedTerritorialPressure[key] * (1 - this.decay)
            );
        }
        this._territorialPressureSeed = clamp01(this._territorialPressureSeed * (1 - this.decay));
        for (const key of Object.keys(this.directedFear)) {
            this.directedFear[key] = clamp01(this.directedFear[key] * (1 - this.decay));
        }
        this._fearSeed = clamp01(this._fearSeed * (1 - this.decay));
        // Grievance decays much more slowly (§210: institutional memory is sticky).
        for (const key of Object.keys(this.directedGrievance)) {
            this.directedGrievance[key] = clamp01(
                this.directedGrievance[key] * (1 - this.decay * 0.2)
            );
        }
        this._grievanceSeed = clamp01(this._grievanceSeed * (1 - this.decay * 0.2));
        for (const event of newEvents) {
            if (event.type === 'TRESPASS') this.recordTrespass({ ...event, tick });
            else if (event.type === 'TRADE') this.recordTrade({ ...event, tick });
            else if (event.type === 'HARM') this.recordHarm({ ...event, tick });
        }
    }

    /**
     * Observe the current stance. If the stance changed since the last
     * observation, record a STANCE_TRANSITION event in the audit trail.
     * Returns the observed stance so callers can chain it.
     */
    observe(stance, tick = 0) {
        if (this._lastObservedStance !== stance) {
            this.events.push({
                type: 'STANCE_TRANSITION',
                tick,
                from: this._lastObservedStance,
                to: stance,
            });
            this._lastObservedStance = stance;
        }
        return stance;
    }

    /**
     * §15 directional stance read: return the last stance
     * observed *from* `fromFactionId`'s perspective. Returns
     * `undefined` if the perspective has not been observed
     * yet (so the first observation fires a STANCE_OBSERVATION
     * event). The legacy `stance` getter remains the
     * symmetric view.
     */
    stanceFrom(fromFactionId) {
        if (fromFactionId
            && Object.prototype.hasOwnProperty.call(this._stanceFrom, fromFactionId)) {
            return this._stanceFrom[fromFactionId];
        }
        if (Object.prototype.hasOwnProperty.call(this._stanceFrom, '*default*')) {
            return this._stanceFrom['*default*'];
        }
        return undefined;
    }

    /**
     * §15 directional stance write: record a new stance
     * observation from `fromFactionId`'s perspective.
     * Also updates the legacy symmetric `stance` field
     * to the most recent observation so legacy callers
     * see consistent state.
     */
    observeFrom(fromFactionId, stance, tick = 0) {
        // Stance codes are integers in [0, 7] (TOLERANT
        // .. CEASEFIRE), so we do NOT clamp01 here. The
        // legacy `observe(stance, tick)` method also
        // passes the value through unmodified.
        const next = stance;
        const previous = this.stanceFrom(fromFactionId);
        if (fromFactionId) {
            this._stanceFrom[fromFactionId] = next;
        } else {
            this._stanceFrom['*default*'] = next;
        }
        this._lastObservedStance = next;
        if (next !== previous) {
            this.events.push({
                type: 'STANCE_OBSERVATION',
                fromFactionId: fromFactionId || '*default*',
                tick,
                from: previous,
                to: next,
            });
        }
        return next;
    }

    pressure() {
        // §20 conceptual form, reduced to the §395 MVP vector.
        // All components are in [0, 1]; trust is a dampener.
        const rawPressure = clamp01(
            this.grievance * 0.3
            + this.fear * 0.2
            + this.territorialPressure * 0.5
        );
        const damping = clamp01(this.trust) * TRUST_DAMPING;
        return clamp01(rawPressure * (1 - damping));
    }

    /**
     * §15 directional pressure read: same formula as
     * `pressure()` but uses `getTrustFrom(fromFactionId)`
     * for the trust-dampening term AND
     * `getTerritorialPressureFrom(fromFactionId)` /
     * `getGrievanceFrom(fromFactionId)` /
     * `getFearFrom(fromFactionId)` for the three
     * directional pressure components. A→B and B→A can
     * therefore hold independent pressure values when
     * the two observers have recorded different
     * intrusions. The legacy `pressure()` (no arg)
     * remains the symmetric mean view.
     */
    pressureFrom(fromFactionId) {
        const rawPressure = clamp01(
            this.getGrievanceFrom(fromFactionId) * 0.3
            + this.getFearFrom(fromFactionId) * 0.2
            + this.getTerritorialPressureFrom(fromFactionId) * 0.5
        );
        const damping = clamp01(this.getTrustFrom(fromFactionId)) * TRUST_DAMPING;
        return clamp01(rawPressure * (1 - damping));
    }

    /**
     * §344 explanation API as an instance method (the module also
     * exports a pure `explainStance` for callers that don't need
     * a relationship vector). Returns the same shape: `{ decision,
     * topFactors }` ordered by absolute contribution.
     */
    explain() {
        return explainStance({
            pressure: this.pressure(),
            trust: this.trust,
            tradeDependency: this.tradeDependency,
            territorialPressure: this.territorialPressure,
            fear: this.fear,
        });
    }

    /**
     * Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE:
     * derived legacy views for the three pressure
     * components. The authoritative source of truth is the
     * directed map (e.g. `directedTerritorialPressure`);
     * the legacy field returns the mean across observers
     * so a caller that has not been updated for the
     * directional contract still gets a reasonable
     * symmetric view. Setters throw (mirror the `trust`
     * setter at lines 156-162) so any attempt to write
     * `vector.territorialPressure = X` fails loudly
     * rather than silently desyncing the two sources of
     * truth.
     */
    get territorialPressure() {
        const values = Object.values(this.directedTerritorialPressure);
        if (values.length === 0) return this._territorialPressureSeed ?? 0;
        let sum = 0;
        for (const v of values) sum += clamp01(v);
        return sum / values.length;
    }

    set territorialPressure(_value) {
        throw new TypeError(
            'FactionRelationshipVector.territorialPressure is a derived view; the ' +
            'authoritative source of truth is `directedTerritorialPressure`. Use ' +
            '`setTerritorialPressureFrom(observerFactionId, value)` or ' +
            '`recordIntrusion({ observerFactionId, ... })` instead.'
        );
    }

    get grievance() {
        const values = Object.values(this.directedGrievance);
        if (values.length === 0) return this._grievanceSeed ?? 0;
        let sum = 0;
        for (const v of values) sum += clamp01(v);
        return sum / values.length;
    }

    set grievance(_value) {
        throw new TypeError(
            'FactionRelationshipVector.grievance is a derived view; the ' +
            'authoritative source of truth is `directedGrievance`. Use ' +
            '`setGrievanceFrom(observerFactionId, value)` instead.'
        );
    }

    get fear() {
        const values = Object.values(this.directedFear);
        if (values.length === 0) return this._fearSeed ?? 0;
        let sum = 0;
        for (const v of values) sum += clamp01(v);
        return sum / values.length;
    }

    set fear(_value) {
        throw new TypeError(
            'FactionRelationshipVector.fear is a derived view; the ' +
            'authoritative source of truth is `directedFear`. Use ' +
            '`setFearFrom(observerFactionId, value)` instead.'
        );
    }

    /**
     * Convenience: return the current stance of this pair.
     * Slice EVID-2026-08-28-PERSPECTIVE-AWARE-CHOOSE-STANCE-LIVE
     * updated this to return the PEAK stance across
     * perspectives (the most-escalated view). The legacy
     * semantic was "the most recent observation"; the
     * directional model means that observation can
     * differ by perspective (A sees B as threatening; B
     * sees A as not). The peak semantic preserves the
     * "how escalated is this relationship" query that
     * legacy callers (e.g. the invasion gate) expect,
     * while the per-perspective query is available via
     * `stanceFrom(observerId)`. The underlying
     * `_lastObservedStance` is still maintained for
     * backwards compatibility with callers that read it
     * directly.
     */
    get stance() {
        // Peak across all explicitly observed perspectives.
        let peak = this._lastObservedStance ?? STANCE_STAY_TOLERANT;
        if (this._stanceFrom) {
            for (const v of Object.values(this._stanceFrom)) {
                if (typeof v === 'number' && v > peak) peak = v;
            }
        }
        return peak;
    }
}

/**
 * Evaluate the new stance from a relationship vector and a previous stance.
 * Implements §23 hysteresis: the threshold to *enter* a stance is higher
 * than the threshold to *exit* it.
 */
export function evaluateStance({
    pressure,
    trust = 0.5,
    previous = STANCE_STAY_TOLERANT,
    thresholds = DEFAULT_THRESHOLDS,
    dampenByTrust = true,
} = {}) {
    const p = clamp01(pressure);
    const t = clamp01(trust);
    // Trust can preemptively lower the pressure for the ladder read.
    // Set `dampenByTrust: false` for material signals (supply shortage,
    // violence, forced march) that the relationship should not paper
    // over. Trust is political; scarcity is material.
    const effective = dampenByTrust
        ? clamp01(p * (1 - t * TRUST_DAMPING))
        : p;

    if (previous === STANCE_WAR) {
        if (effective < thresholds.calmFromWar) return STANCE_CEASEFIRE;
        return STANCE_WAR;
    }
    if (previous === STANCE_CEASEFIRE) {
        // Ceasefire is a hard pause. Exiting requires the relationship to
        // have *recovered* (trust rises) AND pressure to be low.
        if (effective < thresholds.calmFromWar && t > 0.5) return STANCE_STAY_TOLERANT;
        return STANCE_CEASEFIRE;
    }
    if (previous === STANCE_LIMITED_CONFLICT) {
        if (effective < thresholds.calmFromLimitedConflict) return STANCE_MOBILIZING;
        if (effective >= thresholds.war) return STANCE_WAR;
        return STANCE_LIMITED_CONFLICT;
    }
    if (previous === STANCE_MOBILIZING) {
        if (effective < thresholds.calmFromMobilizing) return STANCE_DEFENSIVE;
        if (effective >= thresholds.limitedConflict) return STANCE_LIMITED_CONFLICT;
        return STANCE_MOBILIZING;
    }
    if (previous === STANCE_HOSTILE) {
        if (effective < thresholds.calmFromHostile) return STANCE_DEFENSIVE;
        if (effective >= thresholds.mobilizing) return STANCE_MOBILIZING;
        return STANCE_HOSTILE;
    }
    if (previous === STANCE_DEFENSIVE) {
        if (effective < thresholds.calmFromDefensive) return STANCE_WATCHFUL;
        if (effective >= thresholds.hostile) return STANCE_HOSTILE;
        return STANCE_DEFENSIVE;
    }
    if (previous === STANCE_WATCHFUL) {
        if (effective < thresholds.calmFromWatchful) return STANCE_STAY_TOLERANT;
        if (effective >= thresholds.defensive) return STANCE_DEFENSIVE;
        return STANCE_WATCHFUL;
    }
    // previous === TOLERANT
    if (effective >= thresholds.war) return STANCE_WAR;
    if (effective >= thresholds.limitedConflict) return STANCE_LIMITED_CONFLICT;
    if (effective >= thresholds.mobilizing) return STANCE_MOBILIZING;
    if (effective >= thresholds.hostile) return STANCE_HOSTILE;
    if (effective >= thresholds.defensive) return STANCE_DEFENSIVE;
    if (effective >= thresholds.watchful) return STANCE_WATCHFUL;
    return STANCE_STAY_TOLERANT;
}

/**
 * The §344 decision explanation API. Returns the structured top factors
 * that drove the current stance. Pure.
 */
export function explainStance({
    pressure = 0,
    trust = 0.5,
    tradeDependency = 0,
    territorialPressure = 0,
    fear = 0,
    perTargetMemory = 0,
} = {}) {
    const factors = [
        { name: 'territorialPressure', value: clamp01(territorialPressure), weight: 0.5 },
        { name: 'grievance', value: clamp01(pressure), weight: 0.3 },
        { name: 'fear', value: clamp01(fear), weight: 0.2 },
        { name: 'tradeDependency', value: clamp01(tradeDependency), weight: 0.15 },
        { name: 'perTargetMemory', value: clamp01(perTargetMemory), weight: 0.25 },
        { name: 'trust', value: clamp01(trust), weight: 0.5, dampens: true },
    ];
    factors.sort((a, b) => {
        const contributionA = a.value * a.weight * (a.dampens ? -1 : 1);
        const contributionB = b.value * b.weight * (b.dampens ? -1 : 1);
        return Math.abs(contributionB) - Math.abs(contributionA);
    });
    // Choose a coarse decision label by the top non-dampener factor.
    const top = factors.find(factor => !factor.dampens) || factors[0];
    const decision = top.value > 0.5 ? 'ESCALATE' : top.value < 0.2 ? 'HOLD_PEACE' : 'WATCH';
    return { decision, topFactors: factors };
}

// Thresholds for the §18 capability + uncertainty gates
// (audit P1 #2). These are the documented gates: a
// faction cannot escalate into the war band without
// sufficient military resources, and cannot escalate
// from TOLERANT on uncertain information alone.
const CAPABILITY_GATE = Object.freeze({
    // To enter MOBILIZING / WAR / LIMITED_CONFLICT, the
    // faction must have at least this much military
    // resource.
    militaryResourcesMin: 0.3,
    // To escalate from TOLERANT, the faction must have
    // at least this much information confidence.
    informationConfidenceMinForTolerantEscalation: 0.4,
});

/**
 * The §18 / audit P1 #2 stance machine. Returns a
 * structured decision object so every transition is
 * explainable.
 *
 * The decision shape:
 *   { from, to, reason, evidence, capability, blocked }
 *
 * The audit's acceptance test: "Two factions can move
 * across multiple stance states for causal reasons,
 * de-escalate, and explain each transition." The
 * `reason` field carries the causal explanation (the
 * pressure band, the trust damping, the calming). The
 * `evidence` and `capability` fields carry the gate
 * statuses (information confidence and military
 * resources respectively).
 *
 * @param {Object} options
 * @param {number} options.pressure - normalized [0, 1]
 * @param {number} options.trust - normalized [0, 1]
 * @param {number} options.previous - the prior stance code
 * @param {number} options.militaryResources - normalized
 *   [0, 1]. The capability gate. Below the threshold,
 *   the faction cannot enter MOBILIZING / WAR /
 *   LIMITED_CONFLICT.
 * @param {number} options.informationConfidence -
 *   normalized [0, 1]. The uncertainty gate. Below
 *   the threshold, the faction cannot escalate from
 *   TOLERANT (a rumor heard second-hand is not enough
 *   to trigger a war).
 * @returns {{from: number, to: number, reason: string, evidence: object, capability: object, blocked: boolean}}
 */
export function chooseStance({
    pressure,
    trust = 0.5,
    previous = STANCE_STAY_TOLERANT,
    thresholds = DEFAULT_THRESHOLDS,
    militaryResources = 1.0,
    informationConfidence = 1.0,
    perceivedGroupSize = 0,
    previousIncidentsCount = 0,
    dampenByTrust = true,
} = {}) {
    const p = clamp01(pressure);
    const t = clamp01(trust);
    const mr = clamp01(militaryResources);
    const ic = clamp01(informationConfidence);
    const pgs = Number.isFinite(perceivedGroupSize) ? Math.max(0, perceivedGroupSize) : 0;
    const pic = Number.isFinite(previousIncidentsCount) ? Math.max(0, previousIncidentsCount) : 0;
    // Slice EVID-2026-08-28-TERRITORY-VERTICAL-SLICE: prior
    // incidents reduce the protective trust damping. Three
    // incidents halves the damping; five+ caps it at 0.2×.
    // This is the contextual-dampening upgrade Part XIII
    // calls for: trust no longer protects after repeated
    // violations.
    const incidentDampening = Math.max(0.2, 1 - pic * 0.15);
    const effectiveTrust = clamp01(t * incidentDampening);
    // Compute the effective pressure (post-incident-dampened
    // trust) and call `evaluateStance` with `dampenByTrust:
    // false` since we've already applied the damping. This
    // way the `previousIncidentsCount` input actually
    // affects the effective pressure and does not get
    // compounded with a second damping inside
    // `evaluateStance`. The caller's `dampenByTrust` flag
    // still controls whether the political-axis damping
    // applies at all (material signals bypass it).
    const effectivePressure = dampenByTrust
        ? clamp01(p * (1 - effectiveTrust * TRUST_DAMPING))
        : p;
    const candidate = evaluateStance({
        pressure: effectivePressure,
        trust: 0.5, // identity damping inside the function
        previous,
        thresholds,
        dampenByTrust: false, // we have already damped
    });

    // Capability gate: cannot enter MOBILIZING / WAR /
    // LIMITED_CONFLICT without enough military
    // resources. The gate threshold rises with the
    // perceived group size — a lone bandit is one
    // thing, an organized column is another.
    const capabilityThreshold = CAPABILITY_GATE.militaryResourcesMin
        + Math.min(0.4, Math.max(0, pgs - 1) * 0.05);
    const capabilityActive = mr < capabilityThreshold;
    const capabilityGate = {
        militaryResources: mr,
        gateActive: capabilityActive,
        perceivedGroupSize: pgs,
        requiredThreshold: capabilityThreshold,
    };
    const capabilityBlock = capabilityActive
        && (candidate === STANCE_MOBILIZING
            || candidate === STANCE_WAR
            || candidate === STANCE_LIMITED_CONFLICT);
    // If the capability gate blocks the move, clamp the
    // candidate to the highest pre-war stance (HOSTILE).
    let to = capabilityBlock ? Math.min(candidate, STANCE_HOSTILE) : candidate;

    // Uncertainty gate: cannot escalate from TOLERANT
    // without enough information confidence.
    const evidenceActive = ic < CAPABILITY_GATE.informationConfidenceMinForTolerantEscalation;
    const evidenceGate = {
        informationConfidence: ic,
        gateActive: evidenceActive,
    };
    const evidenceBlock = evidenceActive
        && previous === STANCE_STAY_TOLERANT
        && to > STANCE_STAY_TOLERANT;
    if (evidenceBlock) to = STANCE_STAY_TOLERANT;

    const blocked = capabilityBlock || evidenceBlock;
    const reason = blocked
        ? (capabilityBlock && evidenceBlock
            ? 'BLOCKED: insufficient military resources AND uncertain information'
            : capabilityBlock
                ? `BLOCKED: insufficient military resources (${mr.toFixed(2)} < ${capabilityThreshold.toFixed(2)} threshold for groupSize ${pgs}) to enter war band`
                : 'BLOCKED: uncertain information cannot escalate from TOLERANT')
        : (pic >= 3
            ? `escalate despite trust: ${pic} prior incidents reduced trust damping from ${t.toFixed(2)} to ${effectiveTrust.toFixed(2)}; pressure ${p.toFixed(2)} crossed threshold for stance ${to}`
            : to > previous
                ? `escalate: pressure ${p.toFixed(2)} crossed threshold for stance ${to}`
                : to < previous
                    ? `de-escalate: pressure ${p.toFixed(2)} dropped below calm threshold (trust ${t.toFixed(2)})`
                    : `hold: pressure ${p.toFixed(2)} (trust ${t.toFixed(2)}) stays in current stance`);

    return {
        from: previous,
        to,
        reason,
        evidence: {
            ...evidenceGate,
            groupSize: pgs,
            priorIncidents: pic,
            incidentDampening,
            effectiveTrust,
        },
        capability: capabilityGate,
        blocked,
    };
}
