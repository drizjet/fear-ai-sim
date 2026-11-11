import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
/** Round 8 pre-edit and post-edit deterministic real FearServer handler/serializer probe.
 * HTTP starts after raw-body signature gate; WS executes identity, signing, envelope
 * validator preflight. Only simulation and the WS signing gate are deterministic spies.
 */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { MESSAGE_TYPES } from '../../packages/protocol/index.js';

const routes = [
  { name:'profile', path:'/api/v1/moral/profile/register', type:MESSAGE_TYPES.MORAL_PROFILE_REGISTER_REQUEST,
    payload:{agentId:'knight',profile:'AUTHORITARIAN'}, call:'registerAgentMoralProfile' },
  { name:'dissonance', path:'/api/v1/moral/dissonance/query', type:MESSAGE_TYPES.MORAL_DISSONANCE_QUERY_REQUEST,
    payload:{agentId:'knight',transgressionType:'INSUBORDINATION',context:{orderAuthority:.9,fear:.2}}, call:'computeMoralDissonance' },
  { name:'transgression', path:'/api/v1/moral/transgression', type:MESSAGE_TYPES.MORAL_TRANSGRESSION_REQUEST,
    payload:{agentId:'knight',transgressionType:'HARM',context:{necessity:.1}}, call:'recordMoralTransgression' },
  { name:'atonement', path:'/api/v1/moral/atonement', type:MESSAGE_TYPES.MORAL_ATONEMENT_REQUEST,
    payload:{agentId:'knight',atonementType:'CONFESSION',context:{magnitude:.6}}, call:'recordMoralAtonement' },
  { name:'order', path:'/api/v1/moral/order/compliance', type:MESSAGE_TYPES.MORAL_ORDER_COMPLIANCE_REQUEST,
    payload:{agentId:'knight',proposedTransgression:'DESERTION',context:{orderAuthority:.95}}, call:'evaluateMoralOrderCompliance' },
  { name:'state', path:'/api/v1/moral/state/query', type:MESSAGE_TYPES.MORAL_STATE_QUERY_REQUEST,
    payload:{agentId:'knight'}, call:'getAgentMoralState' }
];
const copy = obj => JSON.parse(JSON.stringify(obj));
const values = {
  registerAgentMoralProfile:{profile:'AUTHORITARIAN',foundations:{AUTHORITY:.3}},
  computeMoralDissonance:{rawDissonance:.8,netDissonance:.6},
  recordMoralTransgression:{previousGuilt:0,currentGuilt:.5},
  recordMoralAtonement:{previousGuilt:.5,currentGuilt:.2},
  evaluateMoralOrderCompliance:{willComply:true,refusalProbability:.1},
  getAgentMoralState:{moralProfile:'AUTHORITARIAN',recentHistory:[]}
};
function caseRun(route, transport, scenario) {
  const events = [];
  const disabled = ['disabled','invalid-disabled'].includes(scenario);
  const denied = scenario === 'gate-denial';
  const simulation = {enableMoralDissonance:!disabled};
  for(const [method,answer] of Object.entries(values)) {
    simulation[method] = (...args)=>{
      events.push({event:'simulation',method,args:copy(args)});
      if(disabled) throw Error('simulation-called-when-disabled');
      if(scenario==='throw' || scenario==='unknown-agent') {
        throw Error(scenario==='throw'?'probe-exception-'+method:'UNKNOWN_AGENT: knight absent');
      }
      return copy(answer);
    };
  }
  const server=Object.create(FearServer.prototype);
  server.simulation=simulation;
  server._bindWsIdentity=(_ws,message)=>{ events.push({event:'identity',type:message?.type}); return false; };
  server._gateWsEnvelope=()=>{events.push({event:'signature-gate'});return denied
    ?{ok:false,detail:'signed request rejected by host',reason:'PROBE_GATE_DENIED',sessionId:'host-session'}
    :{ok:true};};
  const ws={readyState:1,bufferedAmount:0,send(raw){events.push({event:'ws-frame',wire:JSON.parse(raw)})}};
  const res={writeHead(status,headers){events.push({event:'http-status',status,headers:headers??null})},
    end(raw){events.push({event:'http-body',body:raw===undefined?null:JSON.parse(raw)})}};
  const body=copy(route.payload);
  if(['invalid','invalid-disabled'].includes(scenario))body.agentId=24;
  if(scenario==='unknown-agent')body.agentId='absent';
  if(scenario==='alias') {
    body.agent_id=body.agentId;delete body.agentId;
    for(const key of ['transgressionType','atonementType','proposedTransgression']) {
      if(key in body){const snake=key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());body[snake]=body[key];delete body[key];}
    }
  }
  let thrown=null;
  try {
    if(transport==='http')server._routeHttpPost(route.path,scenario==='null-body'?null:body,res);
    else {
      const message={type:route.type,...body,id:'fallback-'+route.name};
      if(scenario!=='fallback-id')message.message_id='request-'+route.name;
      server._handleWsMessage(ws,message);
    }
  } catch(e){thrown=e?.message??String(e);}
  return {route:route.name,transport,scenario,events,thrown};
}
const output=[];
for(const route of routes)for(const transport of ['http','ws']){
  for(const scenario of ['success','disabled','invalid','invalid-disabled','throw','unknown-agent','alias','fallback-id'])
    output.push(caseRun(route,transport,scenario));
  if(transport==='ws')output.push(caseRun(route,transport,'gate-denial'));
  if(transport==='http')output.push(caseRun(route,transport,'null-body'));
}
if(output.some(x=>x.thrown)) throw Error('Unexpected uncaught dispatch: '+JSON.stringify(output.filter(x=>x.thrown)));
const report={description:'12 real FearServer moral HTTP/WS dispatch routes, HTTP local validation, WS preflight, actual serializers, deterministic simulation and WS signature spies',scenarioCount:output.length,output};
const actual=createHash('sha256').update(JSON.stringify(report)).digest('hex');
if(actual!=='f0dd0d6feaa4080417807b2b38fe0da3e8d5a2ca889c374ab1c9a7a2ab535699')throw Error('Moral baseline behavior changed: expected f0dd0d6feaa4080417807b2b38fe0da3e8d5a2ca889c374ab1c9a7a2ab535699, got '+actual);
const serverText=readFileSync(new URL('../../packages/runtime/src/FearServer.js',import.meta.url),'utf8');
for(const name of ['HttpMoralRoutes.js','WsMoralRoutes.js','dispatchHttpMoralPost','dispatchWsMoralMessage']) {
  if(!serverText.includes(name))throw Error('Moral boundary missing '+name);
}
console.log('PASS: 108 moral HTTP/WS transport-validation/serialization/signing/side-effect scenarios; baseline SHA256='+actual);
