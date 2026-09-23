import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-TIME-OWNERSHIP-001 — the world clock owns belief timestamps, and the guarantee is
// enforced at two levels: behaviorally (stamps come from the SocietyCore clock) and
// structurally (no production module may even reference wall-clock/random sources).
// Mutant pinned: Date.now restored in socialcore fallbacks.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_MODULES = [
    'societycore.js', 'utilitycore.js', 'decisioncore.js', 'interactioncore.js',
    'advisorygate.js', 'socialcore.js', 'macrocore.js', 'randomcore.js',
];

describe('RESP-TIME-OWNERSHIP-001: world clock owns belief timestamps', () => {
    it('stamps rumor evidence and belief updates with the SocietyCore clock', () => {
        const society = new SocietyCore();
        society.tick();
        const rumor = society.rumors.publish({ claim: 'road-danger', valueEstimate: true });
        const recipient = { sourceTrust: 1 };
        const [belief] = society.spreadRumor(rumor, [recipient]);
        expect(belief.lastUpdated).toBe(1);
        expect(belief.evidence[0].timestamp).toBe(1);
    });

    it('continues using restored world time after save/load', () => {
        const society = new SocietyCore();
        society.tick();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const rumor = restored.rumors.publish({ claim: 'border-closed' });
        const recipient = {};
        const [belief] = restored.spreadRumor(rumor, [recipient]);
        expect(belief.lastUpdated).toBe(restored.now());
        expect(belief.evidence[0].timestamp).toBe(restored.now());
    });

    it('no production module references Date.now, Math.random, or performance.now', () => {
        const forbidden = /Date\.now\s*\(|Math\.random\s*\(|performance\.now\s*\(/;
        const leaks = [];
        for (const file of PRODUCTION_MODULES) {
            const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
            const match = source.match(forbidden);
            if (match) leaks.push(`${file}: ${match[0]}`);
        }
        expect(leaks).toEqual([]); // a restored wall-clock/random call anywhere in production fails here
    });
});
