import {createHash} from 'node:crypto';
/** Deterministic, side-effect-aware FearServer advisory fallback probe.
 * Run unchanged before and after the one-location redundant lookup cleanup.
 * Uses REAL HostFeedbackLoop and HostCapabilityNegotiator, no method spies. */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { INTENT_OUTCOMES, FAILURE_REASONS } from '../../packages/core/src/HostFeedbackLoop.js';
const types = [
  'SEEK_COVER', 'WARN_GROUP', 'CONFRONT_THREAT', 'INVESTIGATE_SOUND',
  'APPROACH_ALLY', 'DESPERATE_FLAIL', 'RECOVERING', 'IDLE_VIGILANT',
  'UNKNOWN_INTENT', 'ATTACK', 'FLEE_FROM', 'FREEZE', 'CAUTIOUS_EXPLORE',
  'CUSTOM_HOST_EXTENSION', '', null
];
const capabilities = [null,[],['MOVE'],['NAVIGATION'],['can_move'],['ALL'],
  ['EVASIVE_MOVEMENT','NAVIGATION'],['USE_COVER']];
const copy = value => JSON.parse(JSON.stringify(value));
const report = [];
for(const type of types)for(const caps of capabilities)for(const failure of [false,true]){
  const server = new FearServer({seed:31415,heartbeatIntervalMs:0});
  const agentId='host-agent';
  if(type && failure){
    for(let n=0;n<3;n++){
      server.feedbackLoop.reportOutcome({
        agentId,intentType:type,outcome:INTENT_OUTCOMES.INTENT_REJECTED,
        reason:FAILURE_REASONS.NO_PATH,tick:n
      });
    }
  }
  const originals=[
    {agent_id:agentId, action_intent: type === null ? null : {type,urgency:.73},tick:23},
    {agent_id:'other',action_intent:{type:'UNKNOWN_INTENT',urgency:.1},tick:23},
    {agent_id:'no-action',action_intent:null},
    null
  ];
  const output=copy(originals);
  const result=server._applyHostContracts(output,caps);
  report.push({
    type,caps,failure,
    output:copy(result),
    sameArray:result===output,
    agentUnavailability:type?server.feedbackLoop.isUnavailable(agentId,type):false,
    totalReports:server.feedbackLoop.totalReports
  });
}
if(report.length!==256)throw Error('Unexpected scenario count: '+report.length);

const result={suite:'Real FearServer HostFeedbackLoop + capability filtering',count:report.length,cases:report};
const digest=createHash('sha256').update(JSON.stringify(result)).digest('hex');
if(digest!=='fcb61ef14c2035e4a8adb49c9e7e0c89de9868cedbfd51d4d8fa42e3275831e4')throw Error('Host output compatibility drift '+digest);
// The normal production fallbackFor() is a pure mapping, and the route should
// evaluate it once. Preserve BOTH serialized fallback placements.
const server=new FearServer({seed:5,heartbeatIntervalMs:0});
for(let i=0;i<3;i++)server.feedbackLoop.reportOutcome({
  agentId:'x',intentType:'SEEK_COVER',outcome:INTENT_OUTCOMES.INTENT_REJECTED,
  reason:FAILURE_REASONS.NO_PATH,tick:i
});
const original=server.feedbackLoop.fallbackFor.bind(server.feedbackLoop);
let calls=0;
server.feedbackLoop.fallbackFor=(name)=>{calls++;return original(name)};
const out=[{agent_id:'x',action_intent:{type:'SEEK_COVER'}}];
server._applyHostContracts(out,null);
if(calls!==1||out[0].action_intent.type!=='FLEE_FROM'||
 out[0].affordance_downgrade.fallback!=='FLEE_FROM')
 throw Error('Duplicate fallback lookup or inconsistent advisory serialization');
console.log('PASS: 256 unchanged host advisory scenarios; 1 fallback lookup; SHA256='+digest);
