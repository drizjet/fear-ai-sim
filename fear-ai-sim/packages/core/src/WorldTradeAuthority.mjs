import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
import { restoreTrustedCivState } from './CivilizationTrustedCheckpoint.mjs';

// Host-authoritative ledger: middleware proposes path progress; this layer is the
// sole owner of delivery, theft and toll inventory transfers in this reference.
const clone = v => JSON.parse(JSON.stringify(v));
function amount(v, label) {
  if (!Number.isSafeInteger(v) || v < 0) throw Error(label + ' must be a nonnegative safe integer');
  return v;
}
function id(v) {
  if (typeof v !== 'string' || !v.length) throw Error('nonempty ID required');
  return v;
}
function sumInto(out, goods) {
  for (const [k, value] of Object.entries(goods)) out[k] = (out[k] || 0) + amount(value, k);
}
function plus(stock, goods) {
  for (const [k,v] of Object.entries(goods)) stock[k] = (stock[k] || 0) + v;
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
    const kind=this._policy(p,ship);
    const event={type:'encounter',shipmentId:ship.id,patrolId:p.id,tick,kind};
    if (kind==='toll') {
      const transfer=Math.min(ship.gold,p.toll);
      ship.gold-=transfer;this.factionGold[p.faction]=(this.factionGold[p.faction]||0)+transfer;
      event.gold=transfer;
    }
    if (kind==='attack') {
      const stolen={};
      for (const [k,v] of Object.entries(ship.cargo)) {
        const take=Math.floor(v/4);ship.cargo[k]-=take;stolen[k]=take;
      }
      plus(this.factionLoot[p.faction] ||= {},stolen);
      const entity=this.sim.entities.get(ship.entityId);
      if (entity)entity.cargo=clone(ship.cargo);
      event.stolen=stolen;
    }
    this.events.push(event);
  }
  _settle(ship,tick) {
    if(ship.status==='completed')return false;
    if(ship.status!=='enroute')throw Error('invalid shipment status');
    plus(this.stocks[ship.targetNodeId] ||= {},ship.cargo);
    this.vaults[ship.targetNodeId]=(this.vaults[ship.targetNodeId]||0)+ship.gold;
    ship.cargo={};ship.gold=0;ship.status='completed';
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
    let gold=Object.values(this.vaults).reduce((a,b)=>a+amount(b,'vault'),0);
    gold+=Object.values(this.factionGold).reduce((a,b)=>a+amount(b,'faction gold'),0);
    gold+=Object.values(this.shipments).reduce((a,s)=>a+amount(s.gold,'shipment gold'),0);
    return {goods,gold};
  }
  assertConservation() {
    if(this.initial === null)return true;
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
    if(!Array.isArray(staged.events))throw Error('malformed event journal');
    let previousTick=-1;
    for(const event of staged.events){
      if(!Number.isSafeInteger(event.tick) || event.tick < previousTick ||
        event.tick > stagedSim.tickCount)throw Error('invalid event order');
      previousTick=event.tick;
    }
    for(const [id,ship] of Object.entries(staged.shipments)){
      if(id!==ship.id || !['enroute','completed'].includes(ship.status) ||
        !stagedSim.entities.has(ship.entityId) || !stagedSim.routes.has(ship.routeId))
        throw Error('invalid restored shipment');
      const route=stagedSim.routes.get(ship.routeId);
      if(route.fromNodeId!==ship.fromNodeId || route.toNodeId!==ship.targetNodeId)
        throw Error('shipment route disagreement');
      const entity=stagedSim.entities.get(ship.entityId);
      const dispatches=staged.events.filter(e=>e.type==='dispatch' && e.shipmentId===id);
      const arrivals=staged.events.filter(e=>e.type==='arrival_committed' && e.shipmentId===id);
      if(dispatches.length!==1 || arrivals.length!==(ship.status==='completed'?1:0))
        throw Error('shipment journal disagreement');
      if(ship.status==='enroute' && (entity.currentRouteId!==ship.routeId ||
        !sameGoods(entity.cargo,ship.cargo)))throw Error('enroute escrow mismatch');
      if(ship.status==='completed' && (Object.keys(ship.cargo).length!==0 ||
        ship.gold!==0 || entity.currentRouteId!==null))throw Error('completed escrow mismatch');
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
