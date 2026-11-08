import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
/** R9 before/after deterministic FearServer HTTP and WebSocket persona transport probe.
 * Uses the original real validators, public dispatch, frame/status serialization and
 * WebSocket preflight; only signature/identity decisions and simulation operations are
 * deterministic spies. Run from the same immutable script before and after editing. */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { MESSAGE_TYPES } from '../../packages/protocol/index.js';
const cases = [
  {name:'signature',path:'/api/v1/persona/signature/query',type:MESSAGE_TYPES.PERSONA_SIGNATURE_QUERY_REQUEST,
   payload:{agentId:'scout'},method:'computeAgentPersonaSignature'},
  {name:'reaction',path:'/api/v1/persona/reaction/query',type:MESSAGE_TYPES.PERSONA_REACTION_QUERY_REQUEST,
   payload:{agentId:'scout',probeValue:.72},method:'evaluateAgentReaction'},
  {name:'distance',path:'/api/v1/persona/distance/query',type:MESSAGE_TYPES.PERSONA_DISTANCE_QUERY_REQUEST,
   payload:{agentIdA:'scout',agentIdB:'medic'},method:'computeAgentPersonaDistance'},
  {name:'identify',path:'/api/v1/persona/identify',type:MESSAGE_TYPES.PERSONA_IDENTIFY_REQUEST,
   payload:{agentId:'scout',candidateIds:['medic','scout2']},method:'identifyAgentPersona'},
  {name:'collapse',path:'/api/v1/persona/collapse/query',type:MESSAGE_TYPES.PERSONA_COLLAPSE_QUERY_REQUEST,
   payload:{agentId:'scout',populationIds:['scout','medic']},method:'evaluateAgentPersonaCollapse'}
];
const values={
  computeAgentPersonaSignature:{agentId:'scout',traits:{neuroticism:.3},curves:{panic:[0,.5,1]},auc:{panic:.5}},
  evaluateAgentReaction:{agentId:'scout',probeValue:.72,reactions:{panicThreat:.62}},
  computeAgentPersonaDistance:{agentIdA:'scout',agentIdB:'medic',distance:.4},
  identifyAgentPersona:{agentId:'scout',predictedId:'scout2',margin:.9},
  evaluateAgentPersonaCollapse:{agentId:'scout',collapseIndex:.4}
};
const copy=(value)=>JSON.parse(JSON.stringify(value));
function run(item,transport,variant){
 const events=[];
 const disabled=variant==='disabled'||variant==='invalid-disabled';
 const simulation={enablePersonaSignatures:!disabled};
 for(const [name,value] of Object.entries(values)){
   simulation[name]=(...args)=>{
     events.push({event:'sim-call',name,args:copy(args)});
     if(disabled)throw Error('SIMULATION_WRONG_DISABLED');
     if(variant==='throw')throw Error('INJECTED_FAILURE:'+name);
     if(variant==='unknown-agent')throw Error('UNKNOWN_AGENT: unregistered ghost');
     return copy(value);
   };
 }
 const server=Object.create(FearServer.prototype);
 server.simulation=simulation;
 server._bindWsIdentity=(ws,msg)=>{events.push({event:'identity',type:msg?.type??null});return false;};
 server._gateWsEnvelope=()=>{events.push({event:'signing'});
    return variant==='gate-denial'?
     {ok:false,detail:'signature refused',reason:'PROBE_REJECTED',sessionId:'signed-session'}:{ok:true};};
 const ws={readyState:1,bufferedAmount:0,send(raw){events.push({event:'ws',frame:JSON.parse(raw)})}};
 const res={writeHead(status,headers){events.push({event:'status',status,headers:headers??null})},
            end(raw){events.push({event:'body',body:raw===undefined?null:JSON.parse(raw)})}};
 const body=copy(item.payload);
 if(variant==='invalid'||variant==='invalid-disabled'){
   if(item.name==='distance')body.agentIdA=123;
   else body.agentId=123;
 }
 if(variant==='unknown-agent'){
   if(item.name==='distance')body.agentIdA='ghost';else body.agentId='ghost';
 }
 if(variant==='alias'){
   if(item.name==='distance'){body.agent_id_a=body.agentIdA;body.agent_id_b=body.agentIdB;delete body.agentIdA;delete body.agentIdB;}
   else {body.agent_id=body.agentId;delete body.agentId;}
   if(item.name==='reaction'){body.probe_value=body.probeValue;delete body.probeValue;}
   if(item.name==='identify'){body.candidate_ids=body.candidateIds;delete body.candidateIds;}
   if(item.name==='collapse'){body.population_ids=body.populationIds;delete body.populationIds;}
 }
 if(variant==='empty-arrays'){
   if(item.name==='identify')body.candidateIds=[];
   if(item.name==='collapse')body.populationIds=[];
 }
 if(variant==='default-values'){
   if(item.name==='reaction')delete body.probeValue;
   if(item.name==='identify')delete body.candidateIds;
   if(item.name==='collapse')delete body.populationIds;
 }
 let thrown=null;
 try{
   if(transport==='http')server._routeHttpPost(item.path,variant==='null-body'?null:body,res);
   else{
     const message={type:item.type,...body,id:'fallback-'+item.name};
     if(variant!=='fallback-id'&&variant!=='no-correlation')message.message_id='request-'+item.name;
     if(variant==='no-correlation')delete message.id;
     server._handleWsMessage(ws,message);
   }
 }catch(err){thrown=err.message??String(err);}
 return {feature:item.name,transport,variant,events,thrown};
}
const output=[];
const common=['success','disabled','invalid','invalid-disabled','throw','unknown-agent','alias','empty-arrays','default-values','fallback-id'];
for(const item of cases)for(const transport of ['http','ws']){
 for(const variant of common)output.push(run(item,transport,variant));
 output.push(run(item,transport,transport==='http'?'null-body':'gate-denial'));
 if(transport==='ws')output.push(run(item,transport,'no-correlation'));
}
if(output.some(x=>x.thrown))throw Error('Uncaught '+JSON.stringify(output.filter(x=>x.thrown)));
const report={coverage:'5 HTTP + 5 WS persona ingress handlers, 11/12 variants, real serialization/WS preflight and deterministic signing/simulation spies',count:output.length,output};
const actual=createHash('sha256').update(JSON.stringify(report)).digest('hex');
if(actual!=='30fcc5d42d083a002e78cd725b878e3dd310be088e9be37a98039b9d67e92b2b')throw Error('Persona boundary drift: expected 30fcc5d42d083a002e78cd725b878e3dd310be088e9be37a98039b9d67e92b2b; actual '+actual);
const serverText=readFileSync(new URL('../../packages/runtime/src/FearServer.js',import.meta.url),'utf8');
for(const name of ['HttpPersonaRoutes.js','WsPersonaRoutes.js','dispatchHttpPersonaPost','dispatchWsPersonaMessage']){
 if(!serverText.includes(name))throw Error('Persona routing boundary missing: '+name);
}
console.log('PASS: 115 persona HTTP/WS dispatch, validation, signing, correlation and ordered simulation call cases; digest='+actual);
