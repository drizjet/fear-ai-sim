import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';

const traits = JSON.parse(process.argv[2]);
const agent = new AffectiveAgent('probe', traits);
const out = [];
for (let t = 0; t < 120; t++) {
    const r = agent.tick(0.016, { threats: [{ distance: 1 + (t % 5), intensity: 1 }] }, {});
    out.push([r.affective_state.raw_fear, r.fear_band, r.action_intent]);
}
console.log(JSON.stringify(out));
