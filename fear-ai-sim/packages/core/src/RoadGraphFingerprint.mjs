/** Portable, node-based draft of the Fear AI road graph fingerprint contract.
 * Caller supplies independent trusted expected fingerprint. Do not treat a
 * digest stored in the checkpoint as authority. Untrusted JSON input must be
 * checked for duplicate raw keys BEFORE JSON.parse (not yet supported).
 */
import { createHash } from 'node:crypto';
const DOMAIN = Buffer.from('fear-ai-road-graph-v1\0','utf8');
const fail = reason => { throw new Error(reason); };
const isPlain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const compare = (a,b) => { const aa=Array.from(a), bb=Array.from(b); const n=Math.min(aa.length,bb.length);for(let i=0;i<n;i++){const dx=aa[i].codePointAt(0)-bb[i].codePointAt(0);if(dx!==0)return Math.sign(dx);}return Math.sign(aa.length-bb.length); };
const nfc = x => x.normalize('NFC');
function number(v, positive=false){
 if(typeof v !== 'number' || !Number.isFinite(v)) fail('finite numeric value required');
 if(positive && !(v>0))fail('road distance must be positive');
 if(Object.is(v,-0)||v===0)return '0';
 const raw=String(v).toLowerCase(); const [mantissa, expPart='0']=raw.split('e');
 const exp=Number(expPart), negative=mantissa[0]==='-';
 const m=negative?mantissa.slice(1):mantissa;
 const point=m.indexOf('.')>=0?m.indexOf('.'):m.length;
 const all=m.replace('.','');const digits=all.replace(/^0+/,'');
 if(!/^\d+$/.test(all) || digits.length===0)fail('invalid numeric format');
 const removed=all.length-digits.length;
 if(Math.abs(point-removed-1+exp)>100)fail('unsupported graph number magnitude');
 const stripped=digits.replace(/0+$/,'');
 const decimalPlace=point-removed+exp;
 let out;
 if(decimalPlace<=0) out='0.'+'0'.repeat(-decimalPlace)+stripped;
 else if(decimalPlace>=stripped.length)out=stripped+'0'.repeat(decimalPlace-stripped.length);
 else out=stripped.slice(0,decimalPlace)+'.'+stripped.slice(decimalPlace);
 return (negative?'-':'')+out;
}
function tagged(v){
 if(v===null)return ['null'];if(typeof v==='boolean')return ['bool',v];
 if(typeof v==='number')return ['number',number(v)];if(typeof v==='string')return ['str',nfc(v)];
 if(Array.isArray(v))return ['list',v.map(tagged)];
 if(isPlain(v)){const pairs=Object.keys(v).map(k=>[nfc(k),tagged(v[k])]).sort((a,b)=>compare(a[0],b[0]));
  for(let i=1;i<pairs.length;i++)if(pairs[i][0]===pairs[i-1][0])fail('duplicate normalized metadata key');
  return ['map',pairs];}
 return fail('unsupported graph attribute');
}
function nonempty(s){if(typeof s!=='string'||s.length===0)fail('nonempty string ID required');return nfc(s);}
function fields(obj,allowed){if(!isPlain(obj)||Object.keys(obj).some(k=>!allowed.includes(k)))fail('unsupported graph or road field');}
export function canonicalGraph(g){
 fields(g,['nodes','edges','metadata']); if(!('nodes' in g)||!Array.isArray(g.edges))fail('missing graph nodes/edges');
 let nodes;
 if(Array.isArray(g.nodes))nodes=g.nodes.map(s=>[nonempty(s),tagged({})]);
 else if(isPlain(g.nodes))nodes=Object.entries(g.nodes).map(([k,v])=>[nonempty(k),tagged(v)]);
 else fail('nodes must be a list/map');
 nodes.sort((a,b)=>compare(a[0],b[0]));
 for(let i=1;i<nodes.length;i++)if(nodes[i][0]===nodes[i-1][0])fail('duplicate node');
 const nodeIDs=new Set(nodes.map(x=>x[0])),edgeIDs=new Set(),pairs=new Set();
 const edges=g.edges.map(e=>{
  fields(e,['source','target','distance','directed','attributes','id']);
  let a=nonempty(e.source),b=nonempty(e.target); if(!nodeIDs.has(a)||!nodeIDs.has(b))fail('unknown road node');
  const directed=e.directed??false;if(typeof directed!=='boolean')fail('directed must be boolean');
  if(!directed&&compare(b,a)<0)[a,b]=[b,a];
  const key=JSON.stringify([a,b,directed]);if(pairs.has(key))fail('duplicate road topology');pairs.add(key);
  const id=e.id==null?null:nonempty(e.id);if(id!=null){if(edgeIDs.has(id))fail('duplicate road ID');edgeIDs.add(id);}
  return [a,b,directed,number(e.distance,true),id,tagged(e.attributes??{})];
 });
 edges.sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b)));
 // Deliberately Python sorted-key order, not semantic source insertion order.
 return {edges,metadata:tagged(g.metadata??{}),nodes};
}
export function fingerprintGraph(g){const bytes=Buffer.from(JSON.stringify(canonicalGraph(g)),'utf8');return 'sha256:'+createHash('sha256').update(DOMAIN).update(bytes).digest('hex');}
export function verifyTrustedGraph(g,trusted){if(typeof trusted!=='string'||!/^sha256:[0-9a-f]{64}$/.test(trusted))fail('malformed external trusted fingerprint');if(fingerprintGraph(g)!==trusted)fail('graph differs from independently trusted graph');return true;}
