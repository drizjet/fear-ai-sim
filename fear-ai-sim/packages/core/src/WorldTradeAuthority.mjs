import { CivilizationSimulationSystem, LOD_CADENCES, assertCivilizationRestoreTarget, assertCivilizationCognitiveAndDangerState, assertDataOnlyHostGraph } from './CivilizationSimulationSystem.js';
import { restoreTrustedCivState } from './CivilizationTrustedCheckpoint.mjs';

// Host-authoritative ledger: middleware proposes path progress; this layer is the
// sole owner of delivery, theft and toll inventory transfers in this reference.
const clone = v => JSON.parse(JSON.stringify(v));
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function assertWritableLedgerRecord(record, label) {
  // A conservation-balanced primitive/array is not a usable transfer target.
  // Frozen, accessor-backed and readonly dictionaries can also throw midway
  // through a tick after the simulation clock or escrow has been mutated.
  if (!isRecord(record) || !Object.isExtensible(record))
    throw Error('invalid live writable ' + label);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(record))) {
    id(key);
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.writable)
      throw Error('invalid live writable ' + label);
  }
}
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
// JSON tuples are injective for arbitrary strings, including "|" and
// escaped characters; concatenation with a separator is not.
const relationKey = (a,b) => JSON.stringify([id(a),id(b)]);
function restoredRelations(entries) {
  const out = {};
  for (const [key,score] of Object.entries(entries)) {
    if(!Number.isFinite(score) || score < -1 || score > 1)
      throw Error('invalid restored relation');
    let pair;
    if(key.startsWith('[')) {
      try { pair=JSON.parse(key); } catch { throw Error('invalid restored relation'); }
      if(!Array.isArray(pair) || pair.length!==2 ||
        typeof pair[0]!=='string' || typeof pair[1]!=='string' ||
        relationKey(pair[0],pair[1])!==key)
        throw Error('invalid restored relation');
    }else{
      // Old checkpoints stored "a|b"; only a single separator is invertible.
      pair=key.split('|');
      if(pair.length!==2)throw Error('ambiguous legacy relation key');
    }
    const encoded=relationKey(pair[0],pair[1]);
    if(Object.hasOwn(out,encoded))throw Error('duplicate restored relation');
    out[encoded]=score;
  }
  return out;
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
function hasDensePatrolRoutes(routes,sim) {
  // Array.every skips holes. Roaming samples indices, including missing ones.
  for(let i=0;i<routes.length;i++)
    if(!Object.hasOwn(routes,i) || !sim.routes.has(routes[i]))return false;
  return true;
}
function assertPatrolShape(patrolId,p,sim) {
  id(patrolId);
  if(!isRecord(p) || p.id!==patrolId || typeof p.passive!=='boolean' ||
    !Array.isArray(p.routeIds) || p.routeIds.length===0 ||
    !hasDensePatrolRoutes(p.routeIds,sim) ||
    !p.routeIds.includes(p.currentRouteId) ||
    ![p.hunger,p.threat,p.grievance].every(x=>Number.isFinite(x)&&x>=0&&x<=1) ||
    !Number.isSafeInteger(p.lastRoamTick) || p.lastRoamTick<0 ||
    p.lastRoamTick>sim.tickCount)throw Error('invalid restored or live patrol');
  id(p.faction);
  amount(p.toll,'patrol toll');
  if(amount(p.roamEvery,'roam period')===0)throw Error('invalid roam period');
}

export class WorldTradeAuthority {
  constructor(sim = new CivilizationSimulationSystem({ distanceAwareTravel: true })) {
    if (!(sim instanceof CivilizationSimulationSystem)) throw Error('civilization simulation required');
    if (sim.config.distanceAwareTravel !== true) throw Error('distance-aware caravan simulation required');
    this.sim = sim;
    this.stocks = {}; this.vaults = {}; this.factionLoot = {}; this.factionGold = {};
    this.shipments = {}; this.relations = {}; this.patrols = {}; this.events = [];
    this.initial = null; this.rng = 0xBADC0FFE;
  }
  sealHostTransferIngress() {
    return this.sim.sealHostTransferIngress();
  }
  // Only receives primitive wire strings. Host-only signal and nontrade
  // metadata are delegated to the simulator; escrow stays authority-owned.
  acceptHostTransferFrame(wire, capability) {
    return this.sim.acceptHostTransferFrame(wire, capability);
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
    this.relations[relationKey(a,b)] = score;
    this.relations[relationKey(b,a)] = score;
  }
  sealGenesis(seed=0xBADC0FFE) {
    if (this.initial !== null) throw Error('already sealed');
    this.rng = amount(seed,'seed') >>> 0;
    this.initial = this.totals();
    return clone(this.initial);
  }
  dispatch({id:shipmentId, routeId, fromNodeId, faction, cargo, gold = 0, threat = 0, guard = 0}) {
    if (this.initial === null) throw Error('genesis not sealed');
    // Public reference-host inventories can be modified by callers. Refuse an
    // already invalid ledger before withdrawing inventory or creating entities.
    this.assertConservation();
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
    const relation=this.relations[relationKey(p.faction,ship.faction)] || 0;
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
  _assertTickReferences() {
    // These reference-host objects are public and can be altered independently.
    // Reject malformed patrols and escrow routing before advanceSimulation(1),
    // not after time, roaming, or encounters have already changed live state.
    if (!Number.isSafeInteger(this.sim.tickCount) ||
      this.sim.tickCount<0 || this.sim.tickCount===Number.MAX_SAFE_INTEGER)
      throw Error('invalid live simulation clock');
    const nextTick=this.sim.tickCount+1;
    if (!(this.sim.routes instanceof Map) || !(this.sim.entities instanceof Map))
      throw Error('invalid live simulation maps');
    for (const name of ['stocks','factionLoot']) {
      assertWritableLedgerRecord(this[name],name);
      for (const record of Object.values(this[name]))
        assertWritableLedgerRecord(record,name+' entry');
    }
    for (const name of ['vaults','factionGold'])
      assertWritableLedgerRecord(this[name],name);
    // Event writes and escrow/pressure mutations are part of the same tick;
    // their public containers must remain writable before advancing time.
    if (!Array.isArray(this.events) || !Object.isExtensible(this.events) ||
      !Object.getOwnPropertyDescriptor(this.events,'length')?.writable ||
      this.events.push!==Array.prototype.push)
      throw Error('invalid live writable event journal');
    if (!Array.isArray(this.sim.events) || !Object.isExtensible(this.sim.events) ||
      !Object.getOwnPropertyDescriptor(this.sim.events,'length')?.writable ||
      this.sim.events.push!==Array.prototype.push)
      throw Error('invalid live writable simulation journal');
    for(const [patrolId,p] of Object.entries(this.patrols)){
      assertPatrolShape(patrolId,p,this.sim);
      assertWritableLedgerRecord(p,'patrol');
    }
    // Encounter policy reads this host-public dictionary after simulation
    // advance and may run after multiple caravan arrival intents are emitted.
    // Reuse checkpoint relation-key/score validation without rewriting or
    // requiring writability of this read-only-during-tick lookup table.
    if(!isRecord(this.relations))throw Error('invalid live relations');
    try { restoredRelations(this.relations); }
    catch { throw Error('invalid live relations'); }
    for(const [shipmentId,ship] of Object.entries(this.shipments)){
      id(shipmentId);
      if(!isRecord(ship) || ship.id!==shipmentId ||
        ship.entityId!=='trade:'+shipmentId ||
        typeof ship.encounterDone!=='boolean' ||
        ![ship.threat,ship.guard].every(x=>Number.isFinite(x)&&x>=0&&x<=1) ||
        !['enroute','completed'].includes(ship.status))
        throw Error('invalid live shipment');
      assertWritableLedgerRecord(ship,'shipment');
      assertWritableLedgerRecord(ship.cargo,'shipment cargo');
      const route=this.sim.routes.get(ship.routeId);
      if(!route || route.fromNodeId!==ship.fromNodeId ||
        route.toNodeId!==ship.targetNodeId ||
        !this.sim.entities.has(ship.entityId))
        throw Error('live shipment route disagreement');
      // advanceSimulation() changes tickCount and entity progress before
      // checking caravan distance. A host can mutate these public objects
      // without changing conserved inventory or mirrored escrow.
      if (!isRecord(route) || route.id!==ship.routeId ||
        !Number.isFinite(route.distance) || route.distance<=0 ||
        ![route.baseSecurity,route.perceivedDanger].every(v=>
          Number.isFinite(v)&&v>=0&&v<=1) ||
        !['SAFE','WATCHFUL','CONTESTED','BLOCKED'].includes(route.status))
        throw Error('invalid live caravan route');
      assertWritableLedgerRecord(route,'caravan route');
      const entity=this.sim.entities.get(ship.entityId);
      if (!isRecord(entity) || entity.id!==ship.entityId ||
        entity.type!=='CARAVAN' ||
        (ship.status==='enroute' && entity.currentRouteId!==ship.routeId) ||
        (ship.status==='completed' && entity.currentRouteId!==null) ||
        typeof entity.routeProgress!=='number' ||
        !Number.isFinite(entity.routeProgress) ||
        entity.routeProgress<0 || entity.routeProgress>1 ||
        !Number.isSafeInteger(entity.lastUpdateTick) ||
        entity.lastUpdateTick<0 || entity.lastUpdateTick>this.sim.tickCount ||
        !Number.isFinite(entity.fear) || entity.fear<0 || entity.fear>1)
        throw Error('invalid live caravan entity');
      assertWritableLedgerRecord(entity,'caravan entity');
    }
    // Preserve the original shipment-specific refusal diagnostics above.
    // advanceSimulation also decays every road and processes every entity,
    // including those outside this trade authority's shipment namespace.
    if (!isRecord(this.sim.config) || this.sim.config.distanceAwareTravel!==true ||
      !Number.isFinite(this.sim.config.routeDangerHalfLifeTicks) ||
      this.sim.config.routeDangerHalfLifeTicks<=0)
      throw Error('invalid live simulation travel or danger configuration');
    for(const [routeId,route] of this.sim.routes){
      if(!isRecord(route) || route.id!==routeId ||
        !Number.isFinite(route.baseSecurity) || route.baseSecurity<0 ||
        route.baseSecurity>1 || !Number.isFinite(route.perceivedDanger) ||
        route.perceivedDanger<0 || route.perceivedDanger>1)
        throw Error('invalid live simulation route');
      if(route.perceivedDanger>1-route.baseSecurity)
        assertWritableLedgerRecord(route,'decaying simulation route');
    }
    for(const [entityId,entity] of this.sim.entities){
      if(!isRecord(entity) || entity.id!==entityId ||
        !Number.isSafeInteger(entity.lastUpdateTick) ||
        entity.lastUpdateTick<0 || entity.lastUpdateTick>this.sim.tickCount)
        throw Error('invalid live simulation entity');
      const cadence=LOD_CADENCES[entity.lodTier] || 1;
      if(nextTick-entity.lastUpdateTick<cadence)continue;
      assertWritableLedgerRecord(entity,'due simulation entity');
      if(!entity.currentRouteId)continue;
      const route=this.sim.routes.get(entity.currentRouteId);
      if(!route)continue; // Missing routes are skipped by advanceSimulation.
      if(!Number.isFinite(entity.fear) || entity.fear<0 || entity.fear>1 ||
        !Number.isFinite(entity.routeProgress) ||
        entity.routeProgress<0 || entity.routeProgress>1)
        throw Error('invalid live simulation entity progress');
      if(this.sim.config.distanceAwareTravel===true && entity.type==='CARAVAN' &&
        (!Number.isFinite(Number(this.sim.config.caravanUnitsPerTick)) ||
          Number(this.sim.config.caravanUnitsPerTick)<=0 ||
          !Number.isFinite(route.distance) || route.distance<=0))
        throw Error('invalid live simulation caravan travel');
      // A finite speed can still overflow for a coarse LOD catch-up. The
      // simulator's clamp01(Infinity) returns zero rather than advancing.
      if(this.sim.config.distanceAwareTravel===true && entity.type==='CARAVAN' &&
        route.status!=='BLOCKED') {
        const delta=Number(this.sim.config.caravanUnitsPerTick) *
          (nextTick-entity.lastUpdateTick) *
          (entity.fear>0.6?1.4:1.0) / route.distance;
        if(!Number.isFinite(delta))
          throw Error('invalid live simulation caravan step');
      }
    }
    // The reference simulation will also update nontrade/offscreen entities
    // and unrelated roads. A malformed LOD or history must not survive until
    // after the clock, delivery intents or escrow transfers have advanced.
    assertCivilizationCognitiveAndDangerState({
      tickCount:this.sim.tickCount,
      routes:this.sim.routes.values(),
      entities:this.sim.entities.values()
    }, true); // Preserve neutral-entity unknown-LOD cadence-one fallback.
  }
  tick() {
    if (this.initial === null) throw Error('genesis not sealed');
    this.assertConservation();
    this._assertTickReferences();
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
  getState(options = {}) {
    // Opt-in only. The ordinary authority JSON checkpoint retains its
    // historical custom-toJSON behavior. In data-only mode, reject ordinary
    // own callbacks before JSON.stringify can execute them; this is not a
    // Proxy sandbox or protection from hooks on separately owned fields.
    const dataOnly=options?.dataOnlyHostMetadata===true;
    const snapshot={version:1,sim:this.sim.getState(dataOnly ? options : {}),stocks:this.stocks,vaults:this.vaults,
      factionLoot:this.factionLoot,factionGold:this.factionGold,shipments:this.shipments,
      relations:this.relations,patrols:this.patrols,events:this.events,initial:this.initial,rng:this.rng};
    if(dataOnly)assertDataOnlyHostGraph(snapshot);
    return clone(snapshot);
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
    staged.relations=restoredRelations(staged.relations);
    for(const [patrolId,p] of Object.entries(staged.patrols))
      assertPatrolShape(patrolId,p,stagedSim);
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
    assertCivilizationRestoreTarget(this.sim);
    // All of these fields are assigned after the simulation transfer.
    // Reject an existing readonly/accessor-backed field before that first
    // transfer; this does not attempt arbitrary Proxy/getter guarantees.
    for(const k of ['stocks','vaults','factionLoot','factionGold','shipments',
      'relations','patrols','events','initial','rng']) {
      const descriptor=Object.getOwnPropertyDescriptor(this,k);
      if(!descriptor || !Object.hasOwn(descriptor,'value') || !descriptor.writable)
        throw Error('invalid writable authority restore target');
    }
    this.sim.setState(stagedSim.getState());
    for(const k of ['stocks','vaults','factionLoot','factionGold','shipments',
      'relations','patrols','events','initial','rng'])this[k]=staged[k];
    return this;
  }
}
