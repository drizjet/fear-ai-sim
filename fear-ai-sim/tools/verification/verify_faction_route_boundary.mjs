import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
/** Round 10 byte-exact before/after boundary probe for 4 HTTP and 4 WS faction routes.
 * Actual FearServer dispatch, validators, WS ingress and serializers; simulation,
 * signing gate and identity decision are deterministic spies. Do not edit after baseline. */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { MESSAGE_TYPES } from '../../packages/protocol/index.js';

const routes = [
 {name:'register',path:'/api/v1/faction/register',type:MESSAGE_TYPES.FACTION_REGISTER_REQUEST,
  body:{factionId:'tribe',archetype:'TRIBAL_CONSENSUS',options:{leader:'elder'}}},
 {name:'deliberate',path:'/api/v1/faction/deliberate',type:MESSAGE_TYPES.FACTION_DELIBERATE_REQUEST,
  body:{factionId:'tribe',incident:{type:'RAID',severity:0.55},context:{powerRatio:0.4}}},
 {name:'directives',path:'/api/v1/faction/directives',type:MESSAGE_TYPES.FACTION_DIRECTIVES_QUERY_REQUEST,
  body:{factionId:'tribe'}},
 {name:'composure',path:'/api/v1/faction/composure',type:MESSAGE_TYPES.FACTION_COMPOSURE_QUERY_REQUEST,
  body:{factionId:'tribe',state:{cohesion:0.8,splinterRisk:0.2}}}
];
const variants=[
 'success','disabled','invalid','invalid-disabled','throw','unknown','alias',
 'fallback-id','no-faction','bad-archetype','null-options','empty-context',
 'unknown-string','custom-state'
];
const clone=x=>JSON.parse(JSON.stringify(x));
const output=[];
function run(route,transport,variant){
 const events=[],disabled=variant==='disabled'||variant==='invalid-disabled';
 const simulation={enableFactionGovernance:!disabled};
 function call(name,args,result){
  events.push({event:'simulation',method:name,args:clone(args)});
  if(disabled)throw Error('WRONG_SIMULATION_WHILE_DISABLED');
  if(variant==='throw')throw Error('INJECTED_FACTION_FAILURE '+name);
  if(variant==='unknown' || variant==='unknown-string'){
    if(name==='getFactionGovernance')return null;
    if(name==='deliberateFactionIncident'||name==='getFactionComposure')
      throw Error(variant==='unknown'?'UNKNOWN_FACTION: missing faction':'Injected UNKNOWN_FACTION text');
  }
  return clone(result);
 }
 simulation.registerFaction=(...args)=>call('registerFaction',args,{archetype:'TRIBAL_CONSENSUS',currentDirective:'HOLD'});
 simulation.deliberateFactionIncident=(...args)=>call('deliberateFactionIncident',args,{decision:'WAIT',approved:false});
 simulation.getFactionGovernance=(...args)=>call('getFactionGovernance',args,{archetype:'TRIBAL_CONSENSUS',currentDirective:'HOLD',grievanceLevel:0.4});
 simulation.getAllFactionDirectives=(...args)=>call('getAllFactionDirectives',args,{tribe:'HOLD',outsiders:'TRADE'});
 simulation.getFactionComposure=(...args)=>call('getFactionComposure',args,{scale:0.7,fractured:false});
 const server=Object.create(FearServer.prototype);
 server.simulation=simulation;
 server._bindWsIdentity=(ws,msg)=>{events.push({event:'identity',type:msg?.type??null});return false;};
 server._gateWsEnvelope=()=>{events.push({event:'signing'});
   return variant==='signing-denial'?{ok:false,reason:'TEST_REFUSAL',detail:'signature refused',sessionId:'session-1'}:{ok:true};};
 const ws={readyState:1,bufferedAmount:0,send(value){events.push({event:'ws',frame:JSON.parse(value)});}};
 const response={writeHead(status,headers){events.push({event:'http-status',status,headers:headers??null});},
  end(text){events.push({event:'http-body',body:text===undefined?null:JSON.parse(text)});}};
 const body=clone(route.body);
 if(variant==='invalid'||variant==='invalid-disabled'){
   if(route.name==='directives')body.factionId={bad:true};
   else body.factionId=42;
 }
 if(variant==='unknown'||variant==='unknown-string')body.factionId='missing';
 if(variant==='alias'){
   body.faction_id=body.factionId;delete body.factionId;
   if(route.name==='register'){body.governance_archetype=body.archetype;delete body.archetype;}
 }
 if(variant==='no-faction')delete body.factionId;
 if(variant==='bad-archetype'&&route.name==='register')body.archetype='NO_SUCH_ARCHETYPE';
 if(variant==='null-options'&&route.name==='register')body.options=null;
 if(variant==='empty-context'&&route.name==='deliberate')delete body.context;
 if(variant==='custom-state'&&route.name==='composure')body.state={leaderVacant:true,cohesion:0.1,splinterRisk:0.9};
 if(variant==='no-faction'&&route.name==='directives')delete body.factionId;
 let thrown=null;
 try {
  if(transport==='http')server._routeHttpPost(route.path,variant==='null-body'?null:body,response);
  else {
   const msg={type:route.type,...body,id:'fallback-'+route.name};
   if(variant!=='fallback-id'&&variant!=='no-correlation')msg.message_id='correlation-'+route.name;
   if(variant==='no-correlation')delete msg.id;
   server._handleWsMessage(ws,msg);
  }
 } catch(err){thrown=err?.message??String(err);}
 return {feature:route.name,transport,variant,events,thrown};
}
for(const route of routes)for(const transport of ['http','ws']){
 for(const variant of variants)output.push(run(route,transport,variant));
 output.push(run(route,transport,transport==='http'?'null-body':'signing-denial'));
 if(transport==='ws')output.push(run(route,transport,'no-correlation'));
}
if(output.some(item=>item.thrown))throw Error('Unexpected uncaught result: '+JSON.stringify(output.filter(item=>item.thrown)));
const report={coverage:'4 HTTP + 4 WS actual dispatch, validators, preflight, serializers and ordered deterministic simulation/signing spies',count:output.length,output};
const actual=createHash('sha256').update(JSON.stringify(report)).digest('hex');
if(actual!=='3d77b50e16b8c8aabaab89664f366d508ca9b9304d628dcfa4d0a6a853061b8d')throw Error('Faction route contract changed: actual='+actual+', expected=3d77b50e16b8c8aabaab89664f366d508ca9b9304d628dcfa4d0a6a853061b8d');
const server=readFileSync(new URL('../../packages/runtime/src/FearServer.js',import.meta.url),'utf8');
for(const name of ['HttpFactionRoutes.js','WsFactionRoutes.js','dispatchHttpFactionPost','dispatchWsFactionMessage'])
 if(!server.includes(name))throw Error('Faction routing boundary missing '+name);
console.log('PASS: 124 faction HTTP/WS control scenarios; byte-identity baseline digest='+actual);
