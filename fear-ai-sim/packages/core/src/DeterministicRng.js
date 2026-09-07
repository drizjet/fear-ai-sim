/**
 * DeterministicRng - Seeded pseudo-random number generator for deterministic simulation.
 * Uses Mulberry32 32-bit generator with state save/restore capabilities.
 */

export class DeterministicRng {
    /**
     * @param {number|string} [seed=1337] - Initial seed
     */
    constructor(seed = 1337) {
        this.initialSeed = seed;
        this.state = this._hashSeed(seed);
    }

    _hashSeed(seed) {
        if (typeof seed === 'number') {
            return (seed >>> 0) || 1337;
        }
        const str = String(seed);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        }
        return (hash >>> 0) || 1337;
    }

    /**
     * Generate next float in [0, 1)
     * @returns {number}
     */
    random() {
        let t = (this.state += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Generate float in [min, max)
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    range(min, max) {
        return min + this.random() * (max - min);
    }

    /**
     * Generate integer in [min, max] inclusive
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    intRange(min, max) {
        const floorMin = Math.ceil(min);
        const floorMax = Math.floor(max);
        return Math.floor(this.random() * (floorMax - floorMin + 1)) + floorMin;
    }

    /**
     * Pick random item from array
     * @template T
     * @param {T[]} array
     * @returns {T|undefined}
     */
    choice(array) {
        if (!array || array.length === 0) return undefined;
        return array[Math.floor(this.random() * array.length)];
    }

    /**
     * Fork a new independent child PRNG from current sequence
     * @returns {DeterministicRng}
     */
    fork() {
        const childSeed = (this.random() * 4294967296) >>> 0;
        return new DeterministicRng(childSeed);
    }

    /**
     * Serialize generator state
     * @returns {object}
     */
    getState() {
        return {
            initialSeed: this.initialSeed,
            state: this.state
        };
    }

    /**
     * Restore generator state
     * @param {object} snapshot
     */
    setState(snapshot) {
        if (snapshot && typeof snapshot.state === 'number') {
            this.state = snapshot.state >>> 0;
            this.initialSeed = snapshot.initialSeed ?? this.initialSeed;
        }
    }

    /**
     * Resolve acceleration provider with defensive native fallback
     * @param {object} [options={}]
     * @returns {{ accelerated: boolean, provider: string, warning?: string }}
     */
    static resolveAcceleration(options = {}) {
        if (typeof options.loader === 'function') {
            try {
                const nativeMod = options.loader();
                if (nativeMod && typeof nativeMod.random === 'function') {
                    return { accelerated: true, provider: 'NATIVE_ACCELERATED' };
                }
                throw new Error('Native loader did not return valid acceleration module');
            } catch (err) {
                return {
                    accelerated: false,
                    provider: 'PURE_SOFTWARE_FALLBACK',
                    warning: `Native acceleration failed: ${err.message}. Falling back to pure software Mulberry32.`
                };
            }
        }
        return { accelerated: false, provider: 'PURE_SOFTWARE_MULBERRY32' };
    }
}

export default DeterministicRng;
