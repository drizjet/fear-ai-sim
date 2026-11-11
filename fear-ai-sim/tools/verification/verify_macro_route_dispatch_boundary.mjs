/**
 * K1 economic/settlement dispatch boundary regression.
 * Exercises the public FearServer method surfaces, real macro delegates and
 * real protocol validator; no stubbing of signing/HTTP preflight internals.
 * Broader signed requests and real socket paths have separate suites.
 */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { MESSAGE_TYPES,ERROR_CODES } from '../../packages/protocol/index.js';
import { dispatchHttpMacroPost } from '../../packages/runtime/src/HttpMacroRoutes.js';
import { dispatchWsMacroMessage } from '../../packages/runtime/src/WsMacroRoutes.js';
let assertions=0;
const assert=(predicate,msg)=>{assertions++;if(!predicate)throw Error('K1 macro dispatch: '+msg)};
const paths=[
 ['/api/v1/economy/market/register',MESSAGE_TYPES.ECONOMY_REGISTER_MARKET_REQUEST,{settlementId:'market-1'}],
 ['/api/v1/economy/trade',MESSAGE_TYPES.ECONOMY_TRADE_REQUEST,{sourceId:'market-1',destId:'market-2',commodity:'FOOD',amount:4}],
 ['/api/v1/economy/raid/query',MESSAGE_TYPES.ECONOMY_RAID_QUERY_REQUEST,{settlementId:'market-1'}],
 ['/api/v1/settlement/register',MESSAGE_TYPES.SETTLEMENT_REGISTER_REQUEST,{settlementId:'settlement-1'}],
 ['/api/v1/settlement/pressure/query',MESSAGE_TYPES.SETTLEMENT_PRESSURE_QUERY_REQUEST,{settlementId:'settlement-1'}],
 ['/api/v1/settlement/migration/wave',MESSAGE_TYPES.SETTLEMENT_MIGRATION_WAVE_REQUEST,{sourceId:'settlement-1',destId:'settlement-2'}]
];
const server=new FearServer({seed:456,port:0,heartbeatIntervalMs:0});
const res=()=>({status:null,body:null,writeHead(status){this.status=status},end(raw){this.body=JSON.parse(raw)}});
const ws=()=>({readyState:1,bufferedAmount:0,frames:[],send(raw){this.frames.push(JSON.parse(raw))}});
for(const [path,type,payload] of paths){
 const disabledRes=res();
 server._routeHttpPost(path,payload,disabledRes);
 assert(disabledRes.status===400,path+' disabled HTTP status');
 assert([ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED,ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED].includes(disabledRes.body?.code),path+' disabled HTTP code');
 const disabledWs=ws();
 server._handleWsMessage(disabledWs,{type,...payload,message_id:'req-'+type});
 assert(disabledWs.frames.length===1&&disabledWs.frames[0].type===MESSAGE_TYPES.ERROR_RESPONSE,type+' disabled WS frame');
 assert([ERROR_CODES.ECONOMIC_FEEDBACK_DISABLED,ERROR_CODES.SETTLEMENT_MIGRATION_DISABLED].includes(disabledWs.frames[0].code),type+' disabled WS code');
 assert(disabledWs.frames[0].message_id==='req-'+type,type+' exact WS message correlation');
 const invalid={...payload};
 if('settlementId'in invalid)invalid.settlementId=55;
 else invalid.sourceId=55;
 const badRes=res();
 server._routeHttpPost(path,invalid,badRes);
 assert(badRes.status===400&&badRes.body.code===ERROR_CODES.VALIDATION_FAILED,path+' HTTP validation before domain mutation');
 const badWs=ws();
 server._handleWsMessage(badWs,{type,...invalid,message_id:'invalid-'+type});
 assert(badWs.frames.length===1&&badWs.frames[0].code===ERROR_CODES.VALIDATION_FAILED,type+' WS preflight validation');
}
assert(typeof dispatchHttpMacroPost==='function'&&typeof dispatchWsMacroMessage==='function','both delegates available');
let threw=false;
try{dispatchHttpMacroPost(server,'/unknown-macro',{},res())}catch(e){threw=String(e.message).includes('Unknown macro control route')}
assert(threw,'HTTP helper unsupported route fails closed');
threw=false;
try{dispatchWsMacroMessage(server,ws(),{type:'UNKNOWN_MACRO'},null)}catch(e){threw=String(e.message).includes('Unknown macro control route')}
assert(threw,'WS helper unsupported type fails closed');
console.log('SUCCESS: '+assertions+' macro route dispatch/validation/disabled/correlation assertions passed.');
