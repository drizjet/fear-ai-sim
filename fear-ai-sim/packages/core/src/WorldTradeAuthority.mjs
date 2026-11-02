import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
import { restoreTrustedCivState } from './CivilizationTrustedCheckpoint.mjs';

// Host-authoritative ledger: middleware proposes path progress; this layer is the
// sole owner of delivery, theft and toll inventory transfers in this reference.
const clone = v => JSON.parse(JSON.stringify(v));
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function amount(v, label) {
  if (!Number.isSafeInteger(v) || v < 0) throw Error(label + ' must be a nonnegative safe integer');
  return v;
}
function checkedSum(a, b, label) {
  const result = amount(a, label) + amount(b, label);
  if (!Number.isSafeInteger(result)) throw Error(label + ' exceeds safe integer range');
  return result;
}
function id(v) {
  if (typeof v !== 'string' || !v.length) throw Error('nonempty ID required');
  // These dictionaries are ordinary JSON objects. Never interpret a caller
  // supplied key as an inherited property or the legacy __proto__ setter.
  if (Object.hasOwn(Object.prototype, v) || v === 'prototype')
    throw Error('reserved ID or goods key: ' + v);
  return v;
}
function sumInto(out, goods) {
  for (const [k, value] of Object.entries(goods)) {
    id(k);
    out[k] = checkedSum(out[k] || 0, value, k);
  }
}
function plus(stock, goods) {
  // Preflight the entire transfer. An overflowing second key must not leave
  // the first key modified before the caller can reject the transaction.
  const next = [];
  for (const [k,v] of Object.entries(goods)) {
    id(k);
    next.push([k, checkedSum(stock[k] || 0, v, k)]);
  }
  for (const [k,v] of next) stock[k] = v;
}
function subtract(stock, goods) {
  for (const [k,v] of Object.entries(goods)) {
    amount(v, k);
    if ((stock[k] || 0) < v) throw Error('insufficient stock: ' + k);
  }
  for (const [k,v] of Object.entries(goods)) stock[k] = (stock[k] || 0) - v;
}
function norm(goods) {
  if (!goods || typeof goods !== 'object' || Array.isArray(goods)) throw Error('invalid cargo');
  const out = {};
  for (const [k,v] of Object.entries(goods)) out[id(k)] = amount(v,k);
  return out;
}
function sameGoods(a,b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every(k => (a[k] || 0) === (b[k] || 0));
}
function clamp(v) { return Math.max(0, Math.min(1, v)); }

export class WorldTradeAuthority {
  constructor(sim = new CivilizationSimulationSystem({ distanceAwareTravel: true })) {
    if (!(sim instanceof CivilizationSimulationSystem)) throw Error('civilization simulation required');
    if (sim.config.distanceAwareTravel !== true) throw Error('distance-aware caravan simulation required');
    this.sim = sim;
    this.stocks = {}; this.vaults = {}; this.factionLoot = {}; this.factionGold = {};
    this.shipments = {}; this.relations = {}; this.patrols = {}; this.events = [];
    this.initial = null; this.rng = 0xBADC0FFE;
  }
  seedNode(node, goods, gold = 0) {
    if (this.initial !== null) throw Error('genesis sealed');
    id(node); if (!this.sim.nodes.has(node) || this.stocks[node]) throw Error('unknown or duplicate node');
    this.stocks[node] = norm(goods); this.vaults[node] = amount(gold, 'gold');
  }
  addPatrol({ id: patrolId, faction, routeIds, passive = true, hunger = 0, threat = 0, grievance = 0, toll = 3, roamEvery = 20 }) {
    if (this.initial !== null) throw Error('genesis sealed');
    id(patrolId); id(faction);
    if (this.patrols[patrolId] || !Array.isArray(routeIds) || !routeIds.length ||
        !routeIds.every(r => this.sim.routes.has(r))) throw Error('invalid patrol');
    if (![hunger,threat,grievance].every(x=>Number.isFinite(x)&&x>=0&&x<=1)) throw Error('invalid pressure');
    amount(toll,'toll'); amount(roamEvery,'roam period'); if (roamEvery===0) throw Error('invalid roam period');
    this.patrols[patrolId] = {id:patrolId,faction,routeIds:[...routeIds],
      currentRouteId:routeIds[0],passive, hunger,threat,grievance,toll,roamEvery,lastRoamTick:0};
    this.factionLoot[faction] ||= {};
    this.factionGold[faction] ||= 0;
  }
  setRelation(a,b,score) {
    if (this.initial !== null) throw Error('genesis sealed');
    id(a);id(b);
    if (!Number.isFinite(score)||score < -1||score > 1)throw Error('bad relationship');
    this.relations[a+'|'+b] = score;
    this.relations[b+'|'+a] = score;
  }
  sealGenesis(seed=0xBADC0FFE) {
    if (this.initial !== null) throw Error('already sealed');
    this.rng = amount(seed,'seed') >>> 0;
    this.initial = this.totals();
    return clone(this.initial);
  }
  dispatch({id:shipmentId, routeId, fromNodeId, faction, cargo, gold = 0, threat = 0, guard = 0}) {
    if (this.initial === null) throw Error('genesis not sealed');
    id(shipmentId);id(faction); id(routeId);id(fromNodeId);
    if (this.shipments[shipmentId]) throw Error('duplicate shipment');
    const route=this.sim.routes.get(routeId);
    if (!route || route.fromNodeId !== fromNodeId || route.status==='BLOCKED')
      throw Error('blocked or invalid route');
    const entityId='trade:'+shipmentId;
    // Never overwrite an unrelated live game unit (or an earlier caravan).
    if (this.sim.entities.has(entityId)) throw Error('caravan entity ID collision');
    const goods=norm(cargo);gold=amount(gold,'gold');
    if (!Number.isFinite(threat)||threat<0||threat>1||!Number.isFinite(guard)||guard<0||guard>1)throw Error('bad guard/threat');
    if (!this.stocks[fromNodeId] || (this.vaults[fromNodeId]||0)<gold)throw Error('insufficient origin');
    subtract(this.stocks[fromNodeId],goods);this.vaults[fromNodeId]-=gold;
    this.sim.registerEntity(entityId,{type:'CARAVAN',factionId:faction, currentRouteId:routeId,
      cargo:clone(goods),wealth:gold,position:{x:0,y:0,z:0}});
    this.shipments[shipmentId]={id:shipmentId,entityId,routeId,fromNodeId,
      targetNodeId:route.toNodeId,faction,cargo:clone(goods),gold,threat,guard,
      status:'enroute',encounterDone:false};
    this.events.push({type:'dispatch',shipmentId,tick:this.sim.tickCount});
    this.assertConservation();
    return clone(this.shipments[shipmentId]);
  }
  _assertEntityMirror(ship) {
    const entity=this.sim.entities.get(ship.entityId);
    if(!entity)throw Error('shipment entity missing');
    const entityCargo=norm(entity.cargo);
    const shipmentCargo=norm(ship.cargo);
    if(!sameGoods(entityCargo,shipmentCargo) ||
      !Number.isSafeInteger(entity.wealth) || entity.wealth!==amount(ship.gold,'shipment gold'))
      throw Error('shipment entity mirror mismatch');
    return entity;
  }
  _syncEntityMirror(ship,entity) {
    entity.cargo=clone(ship.cargo);
    entity.wealth=ship.gold;
  }
  _random() { this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0; return this.rng; }
  _policy(p,ship) {
    const relation=this.relations[p.faction+'|'+ship.faction] || 0;
    const threatened=ship.threat >= 0.7 || p.threat >= 0.7;
    if (p.passive) {
      if (threatened && relation <= -0.5 && p.grievance >= 0.6) return 'attack';
      return 'pass';
    }
    const score=p.hunger*0.45 + (1-relation)*0.5*0.32 + p.grievance*0.28 +
      (threatened?0.18:0) - ship.guard*0.25;
    if (score >= 0.72) return 'attack';
    return p.hunger >= 0.45 && relation < 0.3 ? 'toll' : 'pass';
  }
  _encounter(ship,p,tick) {
    const entity=this._assertEntityMirror(ship);
    const kind=this._policy(p,ship);
    const event={type:'encounter',shipmentId:ship.id,patrolId:p.id,tick,kind};
    if (kind==='toll') {
      const transfer=Math.min(ship.gold,p.toll);
      const factionGold=checkedSum(this.factionGold[p.faction]||0,transfer,'faction gold');
      ship.gold-=transfer;this.factionGold[p.faction]=factionGold;
      event.gold=transfer;
    }
    if (kind==='attack') {
      const stolen={};
      for (const [k,v] of Object.entries(ship.cargo)) stolen[k]=Math.floor(v/4);
      plus(this.factionLoot[p.faction] ||= {},stolen);
      for (const [k,take] of Object.entries(stolen)) ship.cargo[k]-=take;
      event.stolen=stolen;
    }
    this._syncEntityMirror(ship,entity);
    this.events.push(event);
  }
  _settle(ship,tick) {
    if(ship.status==='completed')return false;
    if(ship.status!=='enroute')throw Error('invalid shipment status');
    const entity=this._assertEntityMirror(ship);
    if(entity.currentRouteId!==null)throw Error('settlement before route arrival');
    const vaultGold=checkedSum(this.vaults[ship.targetNodeId]||0,ship.gold,'vault gold');
    plus(this.stocks[ship.targetNodeId] ||= {},ship.cargo);
    this.vaults[ship.targetNodeId]=vaultGold;
    ship.cargo={};ship.gold=0;ship.status='completed';
    this._syncEntityMirror(ship,entity);
    this.events.push({type:'arrival_committed',shipmentId:ship.id,tick});
    return true;
  }
  tick() {
    if (this.initial === null) throw Error('genesis not sealed');
    const intents=this.sim.advanceSimulation(1).arrivalIntents;
    const tick=this.sim.tickCount;
    const roaming=[];
    for(const p of Object.values(this.patrols).sort((a,b)=>a.id.localeCompare(b.id))) {
      p.hunger=clamp(p.hunger+0.002);
      if(tick-p.lastRoamTick>=p.roamEvery) {
        p.lastRoamTick=tick;
        p.currentRouteId=p.routeIds[this._random()%p.routeIds.length];
        const e={type:'roam',patrolId:p.id,routeId:p.currentRouteId,tick};this.events.push(e);roaming.push(e);
      }
    }
    for(const ship of Object.values(this.shipments).sort((a,b)=>a.id.localeCompare(b.id))) {
      if(ship.status!=='enroute')continue;
      const progress=this.sim.entities.get(ship.entityId)?.routeProgress || 0;
      if(!ship.encounterDone && progress>=0.35) {
        // Encounter decided once, including after a save/load or a coarse LOD tick.
        const p=Object.values(this.patrols).sort((a,b)=>a.id.localeCompare(b.id))
          .find(p=>p.currentRouteId===ship.routeId);
        ship.encounterDone=true;
        if(p)this._encounter(ship,p,tick);
      }
    }
    let settled=0;
    for(const intent of intents) {
      if(intent.type!=='caravan_arrival_intent' || !intent.entityId.startsWith('trade:'))continue;
      const sid=intent.entityId.slice(6);const ship=this.shipments[sid];
      if(!ship || ship.entityId!==intent.entityId || ship.routeId!==intent.routeId ||
        ship.targetNodeId!==intent.targetNodeId)throw Error('unknown delivery intent');
      if(this._settle(ship,tick))settled++;
    }
    this.assertConservation();
    return {tick,settled,roaming};
  }
  totals(){
    const goods={},allStocks=[...Object.values(this.stocks),...Object.values(this.factionLoot),
      ...Object.values(this.shipments).map(s=>s.cargo)];
    for(const stock of allStocks) sumInto(goods,stock);
    let gold=Object.values(this.vaults).reduce((a,b)=>checkedSum(a,b,'total gold'),0);
    gold=Object.values(this.factionGold).reduce((a,b)=>checkedSum(a,b,'total gold'),gold);
    gold=Object.values(this.shipments).reduce((a,s)=>checkedSum(a,s.gold,'total gold'),gold);
    return {goods,gold};
  }
  assertConservation() {
    if(this.initial === null)return true;
    for(const ship of Object.values(this.shipments))this._assertEntityMirror(ship);
    const current=this.totals();
    if(!sameGoods(current.goods,this.initial.goods) || current.gold!==this.initial.gold)
      throw Error('resource conservation violated');
    return true;
  }
  getState() {
    return clone({version:1,sim:this.sim.getState(),stocks:this.stocks,vaults:this.vaults,
      factionLoot:this.factionLoot,factionGold:this.factionGold,shipments:this.shipments,
      relations:this.relations,patrols:this.patrols,events:this.events,initial:this.initial,rng:this.rng});
  }
  restore(snapshot,independentTrustedGraphFingerprint) {
    if(!snapshot || snapshot.version!==1 || !snapshot.initial ||
      !Number.isSafeInteger(snapshot.rng) || snapshot.rng<0 || snapshot.rng>0xffffffff)
      throw Error('invalid authority checkpoint');
    const stagedSim=new CivilizationSimulationSystem(this.sim.config);
    restoreTrustedCivState(stagedSim,snapshot.sim,independentTrustedGraphFingerprint);
    const staged=new WorldTradeAuthority(stagedSim);
    for(const k of ['stocks','vaults','factionLoot','factionGold','shipments',
      'relations','patrols','events','initial','rng']) {
      if(snapshot[k]===undefined) throw Error('missing checkpoint field '+k);
      staged[k]=clone(snapshot[k]);
    }
    // A matching road graph authenticates no ledger dictionaries. Do not allow
    // arrays/null to masquerade as maps (Object.values silently accepts arrays).
    for(const k of ['stocks','vaults','factionLoot','factionGold','shipments',
      'relations','patrols','initial']) {
      if(!isRecord(staged[k])) throw Error('invalid checkpoint dictionary '+k);
    }
    if(!isRecord(staged.initial.goods))throw Error('invalid initial goods');
    norm(staged.initial.goods);amount(staged.initial.gold,'initial gold');
    for(const [node,stock] of Object.entries(staged.stocks)){
      id(node);
      if(!stagedSim.nodes.has(node))throw Error('unknown stocked node');
      norm(stock);
      if(!Object.hasOwn(staged.vaults,node))throw Error('unpaired stocked node');
    }
    for(const [node,gold] of Object.entries(staged.vaults)){
      id(node);amount(gold,'vault gold');
      if(!Object.hasOwn(staged.stocks,node))throw Error('unpaired vault node');
    }
    for(const [faction,stock] of Object.entries(staged.factionLoot)){
      id(faction);norm(stock);
    }
    for(const [faction,gold] of Object.entries(staged.factionGold)){
      id(faction);amount(gold,'faction gold');
    }
    for(const [relation,score] of Object.entries(staged.relations)){
      if(typeof relation!=='string' || !Number.isFinite(score) || score < -1 || score > 1)
        throw Error('invalid restored relation');
    }
    for(const [patrolId,p] of Object.entries(staged.patrols)){
      id(patrolId);
      if(!isRecord(p) || p.id!==patrolId || typeof p.passive!=='boolean' ||
        !Array.isArray(p.routeIds) || p.routeIds.length===0 ||
        !p.routeIds.every(r=>stagedSim.routes.has(r)) ||
        !p.routeIds.includes(p.currentRouteId) ||
        ![p.hunger,p.threat,p.grievance].every(x=>Number.isFinite(x)&&x>=0&&x<=1) ||
        !Number.isSafeInteger(p.lastRoamTick) || p.lastRoamTick<0 ||
        p.lastRoamTick>stagedSim.tickCount)throw Error('invalid restored patrol');
      id(p.faction);amount(p.toll,'patrol toll');
      if(amount(p.roamEvery,'roam period')===0)throw Error('invalid roam period');
    }
    if(!Array.isArray(staged.events))throw Error('malformed event journal');
    let previousTick=-1;
    for(const event of staged.events){
      if(!isRecord(event) || !Number.isSafeInteger(event.tick) || event.tick<0 ||
        event.tick < previousTick ||
        event.tick > stagedSim.tickCount)throw Error('invalid event order');
      previousTick=event.tick;
      if(['dispatch','encounter','arrival_committed'].includes(event.type)){
        if(typeof event.shipmentId!=='string' ||
          !Object.hasOwn(staged.shipments,event.shipmentId))
          throw Error('unknown journal shipment');
        if(event.type==='encounter' &&
          (!Object.hasOwn(staged.patrols,event.patrolId) ||
            !['pass','attack','toll'].includes(event.kind)))
          throw Error('invalid encounter journal');
      }else if(event.type==='roam'){
        const p=staged.patrols[event.patrolId];
        if(!p || !p.routeIds.includes(event.routeId))
          throw Error('invalid roam journal');
      }else throw Error('unknown journal event');
    }
    for(const [id,ship] of Object.entries(staged.shipments)){
      if(!isRecord(ship) || id!==ship.id || ship.entityId!=='trade:'+id ||
        typeof ship.encounterDone!=='boolean' ||
        ![ship.threat,ship.guard].every(x=>Number.isFinite(x)&&x>=0&&x<=1) ||
        !['enroute','completed'].includes(ship.status) ||
        !stagedSim.entities.has(ship.entityId) || !stagedSim.routes.has(ship.routeId))
        throw Error('invalid restored shipment');
      norm(ship.cargo);amount(ship.gold,'shipment gold');
      const route=stagedSim.routes.get(ship.routeId);
      if(route.fromNodeId!==ship.fromNodeId || route.toNodeId!==ship.targetNodeId)
        throw Error('shipment route disagreement');
      const entity=stagedSim.entities.get(ship.entityId);
      const dispatches=staged.events.filter(e=>e.type==='dispatch' && e.shipmentId===id);
      const arrivals=staged.events.filter(e=>e.type==='arrival_committed' && e.shipmentId===id);
      if(dispatches.length!==1 || arrivals.length!==(ship.status==='completed'?1:0))
        throw Error('shipment journal disagreement');
      if(ship.status==='enroute' && (entity.currentRouteId!==ship.routeId ||
        !sameGoods(norm(entity.cargo),norm(ship.cargo)) || entity.wealth!==ship.gold))
        throw Error('enroute escrow mismatch');
      if(ship.status==='completed' && (Object.keys(ship.cargo).length!==0 ||
        ship.gold!==0 || entity.currentRouteId!==null ||
        !sameGoods(norm(entity.cargo),{}) || entity.wealth!==0))
        throw Error('completed escrow mismatch');
    }
    // The trade: namespace is authoritative here. Otherwise a spoofed caravan
    // is restored successfully and later causes an unknown delivery intent.
    for(const entityId of stagedSim.entities.keys()){
      if(entityId.startsWith('trade:') &&
        !Object.hasOwn(staged.shipments,entityId.slice(6)))
        throw Error('unclaimed trade entity');
    }
    staged.assertConservation();
    // Transfer to the original simulator only after independent map trust
    // and all ledger validation succeeds.
    this.sim.setState(stagedSim.getState());
    for(const k of ['stocks','vaults','factionLoot','factionGold','shipments',
      'relations','patrols','events','initial','rng'])this[k]=staged[k];
    return this;
  }
}
