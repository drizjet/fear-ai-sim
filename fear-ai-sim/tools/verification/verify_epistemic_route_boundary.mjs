/**
 * K1 epistemic HTTP/WS routing contract, including transport-specific
 * validation/refusal ordering. No public server handler is replaced.
 */
import {FearServer} from '../../packages/runtime/src/FearServer.js';
import {dispatchHttpEpistemicPost} from '../../packages/runtime/src/HttpEpistemicRoutes.js';
import {dispatchWsEpistemicMessage} from '../../packages/runtime/src/WsEpistemicRoutes.js';
import {MESSAGE_TYPES,ERROR_CODES} from '../../packages/protocol/index.js';
let count=0;
function check(ok,label){count++;if(!ok)throw Error('Epistemic boundary test failed: '+label)}
const routes=[
 ['/api/v1/epistemic/observe',MESSAGE_TYPES.EPISTEMIC_OBSERVE_REQUEST,{agentId:'agent',observations:{threats:[{id:'t1'}]}}],
 ['/api/v1/epistemic/rumor',MESSAGE_TYPES.EPISTEMIC_RUMOR_REQUEST,{agentId:'agent',message:{category:'threat',id:'r1'},senderTrust:.8}],
 ['/api/v1/epistemic/discrepancy/query',MESSAGE_TYPES.EPISTEMIC_DISCREPANCY_QUERY_REQUEST,{agentId:'agent',worldGroundTruth:{}}],
 ['/api/v1/epistemic/subjective/query',MESSAGE_TYPES.EPISTEMIC_SUBJECTIVE_QUERY_REQUEST,{agentId:'agent'}]
];
const disabled=new FearServer({seed:92,port:0,heartbeatIntervalMs:0});
function response(){return {status:null,json:null,writeHead(code){this.status=code},end(raw){this.json=JSON.parse(raw)}}}
function socket(){return {readyState:1,bufferedAmount:0,frames:[],send(raw){this.frames.push(JSON.parse(raw))}}}
for(const [path,type,payload] of routes){
 const http=response();
 disabled._routeHttpPost(path,payload,http);
 check(http.status===400,path+' disabled HTTP status');
 check(http.json?.code===ERROR_CODES.EPISTEMIC_BELIEF_DISABLED,path+' disabled HTTP code');
 const ws=socket();
 disabled._handleWsMessage(ws,{type,...payload,message_id:'msg-'+type});
 check(ws.frames.length===1&&ws.frames[0].type===MESSAGE_TYPES.ERROR_RESPONSE,type+' disabled error frame');
 check(ws.frames[0].code===ERROR_CODES.EPISTEMIC_BELIEF_DISABLED,type+' disabled WS code');
 check(ws.frames[0].message_id==='msg-'+type,type+' disabled correlation');
 const invalid={...payload,agentId:12};
 const badHttp=response();
 disabled._routeHttpPost(path,invalid,badHttp);
 check(badHttp.status===400&&badHttp.json?.code===ERROR_CODES.VALIDATION_FAILED,path+' HTTP validator precedes disabled gate');
 const badWs=socket();
 disabled._handleWsMessage(badWs,{type,...invalid,message_id:'bad-'+type});
 check(badWs.frames.length===1&&badWs.frames[0].code===ERROR_CODES.VALIDATION_FAILED,type+' WS preflight validates before feature gate');
 check(badWs.frames[0].message_id==='bad-'+type,type+' invalid correlation');
 const fallback=socket();
 disabled._handleWsMessage(fallback,{type,...payload,id:'id-'+type});
 check(fallback.frames[0]?.message_id==='id-'+type,type+' fallback correlation ID');
}
check(typeof dispatchHttpEpistemicPost==='function','HTTP module exported function');
check(typeof dispatchWsEpistemicMessage==='function','WS module exported function');
let refused=false;
try{dispatchHttpEpistemicPost(disabled,'/unknown-epistemic',{},response())}catch(err){refused=err.message.includes('Unknown epistemic control route')}
check(refused,'HTTP helper fails closed on unknown route');
refused=false;
try{dispatchWsEpistemicMessage(disabled,socket(),{type:'UNKNOWN_EPISTEMIC'},null)}catch(err){refused=err.message.includes('Unknown epistemic control route')}
check(refused,'WS helper fails closed on unknown type');
// Guard that denying a signed WebSocket message does not dispatch to any simulation operation.
const denied=socket();
const server=Object.create(FearServer.prototype);
const ops=[];
server.simulation={enableEpistemicBelief:true,recordEpistemicObservation(){ops.push('mutate');throw Error('called forbidden operation')}};
server._bindWsIdentity=()=>ops.push('identity');
server._gateWsEnvelope=()=>{ops.push('signature');return {ok:false,detail:'probe refused',reason:'BAD_SIGNATURE',sessionId:'host'}};
server._handleWsMessage(denied,{type:MESSAGE_TYPES.EPISTEMIC_OBSERVE_REQUEST,agentId:'agent',observations:{},message_id:'signed-request'});
check(ops.join(',')==='identity,signature','identity before signing and no simulation mutation');
check(denied.frames.length===1&&denied.frames[0].message_id==='signed-request','signature refusal correlated');
check(denied.frames[0].code==='BAD_SIGNATURE','signature gate detail is preserved by serializer');
console.log('SUCCESS: '+count+' epistemic HTTP/WS route, validation, correlation and signature-boundary assertions passed.');
