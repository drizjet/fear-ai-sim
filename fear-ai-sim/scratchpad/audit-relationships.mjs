import { createClosedWorldScenario } from '../closed-world.js';

const w = createClosedWorldScenario();
console.log('relationships Map size:', w.relationships.size);
for (const [key, value] of w.relationships) {
    console.log('key:', key, 'type:', typeof value);
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        console.log('  keys (first 10):', keys.slice(0, 10));
        if (value.trust !== undefined) console.log('  trust:', value.trust);
        if (value.stance !== undefined) console.log('  stance:', value.stance);
        if (value.grievance !== undefined) console.log('  grievance:', value.grievance);
        if (value.territorialPressure !== undefined) console.log('  territorialPressure:', value.territorialPressure);
    }
}
console.log('factions[0].stance:', w.factions[0].stance);
console.log('factions[0].memoryByActor:', w.factions[0].memoryByActor);
console.log('factions[0].lastDecision:', w.factions[0].lastDecision);
