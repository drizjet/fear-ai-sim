/**
 * Pin WebSocket pack dispatch after transport/domain extraction.
 * Identity/signing preflight hooks are instrumented; frames use the real send method.
 */
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { MESSAGE_TYPES, ERROR_CODES } from '../../packages/protocol/index.js';

let checks=0;
function check(condition, label) {
    checks += 1;
    if (!condition) throw Error('WS pack contract failed: '+label);
}
const commands=[
    {type:MESSAGE_TYPES.PACK_CREATE_REQUEST,args:{packId:'pack',options:{}},method:'createPack',response:MESSAGE_TYPES.PACK_CREATE_RESPONSE},
    {type:MESSAGE_TYPES.PACK_ASSIGN_MEMBER_REQUEST,args:{packId:'pack',agentId:'wolf'},method:'registerPackMember',response:MESSAGE_TYPES.PACK_ASSIGN_MEMBER_RESPONSE},
    {type:MESSAGE_TYPES.PACK_REMOVE_MEMBER_REQUEST,args:{packId:'pack',agentId:'wolf'},method:'removePackMember',response:MESSAGE_TYPES.PACK_REMOVE_MEMBER_RESPONSE},
    {type:MESSAGE_TYPES.PACK_UPDATE_REQUEST,args:{packId:'pack',phase:'STALKING'},method:'setPackPhase',response:MESSAGE_TYPES.PACK_UPDATE_RESPONSE},
    {type:MESSAGE_TYPES.PACK_QUERY_REQUEST,args:{packId:'pack'},method:'getPackAdvisories',response:MESSAGE_TYPES.PACK_QUERY_RESPONSE}
];
function invoke(raw,options={}) {
    const events=[],frames=[];
    const ws={
        readyState:1,bufferedAmount:0,
        send(serialized){frames.push(JSON.parse(serialized));events.push('frame')}
    };
    const server=Object.create(FearServer.prototype);
    server._bindWsIdentity=()=>events.push('identity');
    server._gateWsEnvelope=()=>{
        events.push('gate');
        return options.gateDenied
          ? {ok:false,detail:'Denied by host signature',reason:'SIGNING_DENIED',sessionId:'host'}
          : {ok:true};
    };
    const spy=(name,result)=>(...args)=>{
        events.push({method:name,args});
        if(options.disabled)throw Error('Disabled path called '+name);
        if(name===options.throwMethod)throw Error('simulated pack failure');
        return result;
    };
    server.simulation={
        packCoordination:!options.disabled,
        createPack:spy('createPack',{id:'pack',phase:'STALKING',pattern:'DEFAULT'}),
        registerPackMember:spy('registerPackMember',{role:'CHASER'}),
        removePackMember:spy('removePackMember',!options.missing),
        setPackPhase:spy('setPackPhase',null),
        setPackPattern:spy('setPackPattern',null),
        setPackTargetThreat:spy('setPackTargetThreat',null),
        getPackAdvisories:spy('getPackAdvisories',options.missing?null:{id:'pack'}),
        getAllPackAdvisories:spy('getAllPackAdvisories',[{id:'pack'}])
    };
    server._handleWsMessage(ws,raw);
    return {events,frames,simulation:events.filter(e=>typeof e==='object')};
}
for(const command of commands){
    const message={type:command.type,...command.args,message_id:'request-'+command.type};
    const success=invoke(message);
    check(success.frames.length===1&&success.frames[0].type===command.response,command.type+' expected success response');
    check(success.frames[0].message_id===message.message_id,command.type+' correlation');
    check(success.events[0]==='identity'&&success.events[1]==='gate',command.type+' preflight ordering');
    check(success.simulation.some(e=>e.method===command.method),command.type+' correct simulation method');
    const disabled=invoke(message,{disabled:true});
    check(disabled.frames.length===1&&disabled.frames[0].type===MESSAGE_TYPES.ERROR_RESPONSE&&disabled.frames[0].code===ERROR_CODES.PACK_COORDINATION_DISABLED,command.type+' disabled code');
    check(disabled.simulation.length===0,command.type+' disabled has no simulation call');
    const thrown=invoke(message,{throwMethod:command.method});
    check(thrown.frames.length===1&&thrown.frames[0].code===ERROR_CODES.SIMULATION_ERROR,command.type+' thrown simulation error code');
    const denied=invoke(message,{gateDenied:true});
    check(denied.frames.length===1&&denied.frames[0].code==='SIGNING_DENIED'&&denied.simulation.length===0,command.type+' gate denial');
    const fallback=invoke({...message,id:'fallback',message_id:undefined});
    check(fallback.frames[0].message_id==='fallback',command.type+' fallback correlation');
}
const all=invoke({type:MESSAGE_TYPES.PACK_QUERY_REQUEST,message_id:'all'});
check(all.frames[0].packId===null&&Array.isArray(all.frames[0].packs),'query all packs');
const missing=invoke({type:MESSAGE_TYPES.PACK_QUERY_REQUEST,packId:'missing',message_id:'missing'},{missing:true});
check(missing.frames[0].code===ERROR_CODES.UNKNOWN_PACK&&missing.frames[0].message_id==='missing','correlated unknown pack');
const removed=invoke({type:MESSAGE_TYPES.PACK_REMOVE_MEMBER_REQUEST,packId:'pack',agentId:'missing'},{missing:true});
check(removed.frames[0].status==='NOT_FOUND','remove missing member');
const multi=invoke({type:MESSAGE_TYPES.PACK_UPDATE_REQUEST,packId:'pack',phase:'STALKING',pattern:'CRESCENT_SURROUND',targetThreat:{x:1,y:2,z:3}});
check(multi.simulation.map(e=>e.method).join(',')==='setPackPhase,setPackPattern,setPackTargetThreat','ordered update field mutations');
const invalid=invoke({type:MESSAGE_TYPES.PACK_CREATE_REQUEST,packId:2,message_id:'bad'});
check(invalid.simulation.length===0&&invalid.frames[0].code===ERROR_CODES.VALIDATION_FAILED,'validation refuses before mutation');
console.log('SUCCESS: '+checks+' WebSocket pack dispatch contract assertions passed.');
