import { createClosedWorldScenario } from '../closed-world.js';
const w = createClosedWorldScenario();
console.log('merchant riskTolerance:', w.merchants[0].riskTolerance);
console.log('merchant keys:', Object.keys(w.merchants[0]));
console.log('merchant selectedRoute:', w.merchants[0].selectedRoute);
