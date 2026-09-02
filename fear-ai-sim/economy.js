/**
 * Deterministic market primitives.
 * Prices are derived from local supply/demand and delivered cargo risk;
 * ground truth and market perception remain separate inputs.
 */

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value)));

export class Market {
    constructor(id, inventory = {}) {
        this.id = id;
        this.inventory = new Map(Object.entries(inventory).map(([kind, amount]) => [kind, Math.max(0, finite(amount))]));
        this.demand = new Map();
        this.basePrice = new Map();
        this.delivered = new Map();
        this.disrupted = new Map();
        // Per-kind storage capacity (default Infinity if not set). The
        // reducer's `produce` step respects this so inventory cannot grow
        // unbounded. Per-kind spoilage rate is a fraction of the current
        // supply lost each call to `spoil` (default 0 = no spoilage).
        this.capacity = new Map();
        this.spoilageRate = new Map();
    }

    setCapacity(kind, amount) {
        this.capacity.set(kind, Math.max(0, finite(amount)));
        return this;
    }

    setSpoilageRate(kind, rate) {
        this.spoilageRate.set(kind, clamp(rate));
        return this;
    }

    setDemand(kind, amount, basePrice = 1) {
        this.demand.set(kind, Math.max(0, finite(amount)));
        this.basePrice.set(kind, Math.max(0.0001, finite(basePrice, 1)));
        if (!this.inventory.has(kind)) this.inventory.set(kind, 0);
        return this;
    }

    deliverCargo(kind, amount, { routeRisk = 0, confidence = 1 } = {}) {
        const quantity = Math.max(0, finite(amount));
        const lossRate = clamp(routeRisk) * (1 - clamp(confidence, 0, 1) * 0.5);
        const delivered = quantity * (1 - lossRate);
        // Respect the storage capacity: a merchant cannot overflow the
        // warehouse. The leftover is recorded as `lost` (alongside the
        // risk-based loss) so callers can audit how much was discarded.
        const cap = this.capacity.has(kind) ? finite(this.capacity.get(kind)) : Infinity;
        const current = Math.max(0, finite(this.inventory.get(kind)));
        const headroom = Math.max(0, cap - current);
        const stored = Math.min(delivered, headroom);
        const overflow = delivered - stored;
        this.inventory.set(kind, current + stored);
        this.delivered.set(kind, (this.delivered.get(kind) || 0) + stored);
        this.disrupted.set(kind, (this.disrupted.get(kind) || 0) + overflow + (quantity - delivered));
        return { shipped: quantity, delivered, stored, lost: quantity - delivered, overflow };
    }

    // Add `amount` units of `kind` to inventory, capped at the configured
    // storage capacity. Returns `{ produced, stored, overflow }` so callers
    // can audit how much was lost to capacity. If no capacity is set,
    // inventory is unbounded.
    produce(kind, amount) {
        const quantity = Math.max(0, finite(amount));
        const cap = this.capacity.has(kind) ? finite(this.capacity.get(kind)) : Infinity;
        const current = Math.max(0, finite(this.inventory.get(kind)));
        const headroom = Math.max(0, cap - current);
        const stored = Math.min(quantity, headroom);
        this.inventory.set(kind, current + stored);
        return { produced: quantity, stored, overflow: quantity - stored };
    }

    // Decay the current supply of `kind` by the configured spoilage rate
    // (a fraction in [0, 1]). Returns the amount spoiled.
    spoil(kind) {
        if (!this.spoilageRate.has(kind)) return { spoiled: 0 };
        const rate = clamp(this.spoilageRate.get(kind));
        if (rate <= 0) return { spoiled: 0 };
        const current = Math.max(0, finite(this.inventory.get(kind)));
        const spoiled = current * rate;
        this.inventory.set(kind, current - spoiled);
        return { spoiled };
    }

    getQuote(kind) {
        const supply = Math.max(0, finite(this.inventory.get(kind)));
        const demand = Math.max(0, finite(this.demand.get(kind)));
        const base = Math.max(0.0001, finite(this.basePrice.get(kind), 1));
        const shortage = demand === 0 ? 0 : clamp((demand - supply) / demand);
        const price = base * (1 + shortage * 2);
        return { marketId: this.id, kind, supply, demand, shortage, price, disrupted: this.disrupted.get(kind) || 0 };
    }

    // Slice N — price elasticity with shortage memory (history-dependent bid curve).
    // A separate method so getQuote stays instantaneous for backward compat.
    // getElasticQuote blends current shortage with an EMA of past shortages plus
    // momentum, making sustained scarcity more expensive than a brief dip.
    getElasticQuote(kind) {
        const supply = Math.max(0, finite(this.inventory.get(kind)));
        const demand = Math.max(0, finite(this.demand.get(kind)));
        const base = Math.max(0.0001, finite(this.basePrice.get(kind), 1));
        const shortage = demand === 0 ? 0 : clamp((demand - supply) / demand);
        if (!this._priceMemory) this._priceMemory = new Map();
        if (!this._priceMemory.has(kind)) {
            this._priceMemory.set(kind, { emaShortage: shortage, prevShortage: shortage });
        }
        const mem = this._priceMemory.get(kind);
        const alpha = 0.3;
        const momentum = clamp(shortage - mem.prevShortage, -1, 1) * 0.5;
        const blended = clamp(shortage * 0.7 + mem.emaShortage * 0.3);
        const price = base * (1 + blended * 2 + momentum);
        mem.emaShortage = clamp(mem.emaShortage * (1 - alpha) + shortage * alpha);
        mem.prevShortage = shortage;
        return { marketId: this.id, kind, supply, demand, shortage, price: Math.max(base * 0.5, price), disrupted: this.disrupted.get(kind) || 0, emaShortage: mem.emaShortage, momentum, blended };
    }

    consume(kind, amount) {
        const quantity = Math.max(0, finite(amount));
        const available = Math.max(0, finite(this.inventory.get(kind)));
        const consumed = Math.min(available, quantity);
        this.inventory.set(kind, available - consumed);
        return { consumed, unmet: quantity - consumed };
    }

    serialize() {
        return {
            id: this.id,
            inventory: [...this.inventory.entries()],
            demand: [...this.demand.entries()],
            basePrice: [...this.basePrice.entries()],
            delivered: [...this.delivered.entries()],
            disrupted: [...this.disrupted.entries()],
            capacity: [...this.capacity.entries()],
            spoilageRate: [...this.spoilageRate.entries()],
            _priceMemory: this._priceMemory ? [...this._priceMemory.entries()] : undefined
        };
    }

    static deserialize(data = {}) {
        const market = new Market(data.id);
        for (const key of ['inventory', 'demand', 'basePrice', 'delivered', 'disrupted', 'capacity', 'spoilageRate']) {
            if (Array.isArray(data[key])) market[key] = new Map(data[key]);
        }
        if (Array.isArray(data._priceMemory)) market._priceMemory = new Map(data._priceMemory);
        return market;
    }
}

export function routeRiskPremium({ perceivedDanger = 0, expectedCargoLoss = 0, confidence = 0 } = {}) {
    return clamp(perceivedDanger) + Math.max(0, finite(expectedCargoLoss)) + (1 - clamp(confidence));
}
