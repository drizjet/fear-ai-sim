import { describe, it, expect } from '@jest/globals';
import { ProtocolValidator } from '../packages/protocol/src/validator.js';
import { MESSAGE_TYPES, PROTOCOL_VERSION } from '../packages/protocol/src/types.js';

// Section CXXX (NEXT-9): protocol fuzz battery. Host input is untrusted:
// every hostile shape must either sanitize to safe values or reject with a
// {valid:false} verdict — never throw, never hang, never leak NaN/Infinity
// or prototype pollution into advisory state.

import { BinaryWireProtocol, BINARY_MAGIC, BINARY_PROTOCOL_VERSION } from '../packages/protocol/src/BinaryWireProtocol.js';
const VALID_OBS = {
  type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
  agent_id: 'a1', x: 1, y: 2, z: 3,
  threats: [{ type: 'PREDATOR', distance: 5, intensity: 0.8 }],
};

describe('CXXX: protocol fuzz battery', () => {
  it('rejects non-object envelopes without throwing', () => {
    for (const raw of [null, undefined, 42, 'str', [1, 2], true, NaN]) {
      let res;
      expect(() => { res = ProtocolValidator.validateIncomingMessage(raw); }).not.toThrow();
      expect(res.valid).toBe(false);
    }
    expect(ProtocolValidator.validateIncomingMessage({}).valid).toBe(false);
    expect(ProtocolValidator.validateIncomingMessage({ type: 42 }).valid).toBe(false);
  });

  it('truncates hostile oversized strings (1MB id, giant name)', () => {
    const big = 'x'.repeat(1024 * 1024);
    const res = ProtocolValidator.validateRegisterAgent({ agent_id: big, name: big });
    expect(res.valid).toBe(true);
    expect(res.value.agent_id.length).toBeLessThanOrEqual(256);
    expect(res.value.name.length).toBeLessThanOrEqual(256);
  });

  it('sanitizes NaN and Infinity numerics to safe defaults (no leakage)', () => {
    const res = ProtocolValidator.validateObservation({
      ...VALID_OBS,
      x: NaN, y: Infinity, z: -Infinity,
      health: NaN, energy: Infinity,
      velocity: { x: NaN, y: Infinity, z: 1 },
      threats: [{ type: 'NOPE', distance: Infinity, intensity: NaN, confidence: -Infinity, x: NaN }],
    });
    expect(res.valid).toBe(true);
    for (const v of [res.value.x, res.value.y, res.value.z, res.value.health, res.value.energy]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(res.value.health).toBe(1.0);
    expect(res.value.energy).toBe(1.0);
    const t = res.value.threats[0];
    expect(t.type).toBe('PREDATOR');
    for (const v of [t.distance, t.x, t.intensity, t.confidence]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(t.intensity).toBe(1.0);
  });

  it('falls back hostile dt values to the default tick', () => {
    for (const dt of [NaN, Infinity, -1, 0, 'fast', null]) {
      const res = ProtocolValidator.validateBatchTick({ type: MESSAGE_TYPES.BATCH_TICK_REQUEST, dt, observations: [] });
      expect(res.value.dt).toBe(0.0166);
    }
    expect(ProtocolValidator.validateBatchTick({ observations: [] }).value.dt).toBe(0.0166);
  });

  it('neutralizes prototype pollution in traits', () => {
    const res = ProtocolValidator.validateRegisterAgent({
      agent_id: 'a1',
      traits: { '__proto__': { polluted: true }, constructor: 1, prototype: 1, courage: 0.9, evil: Infinity },
    });
    expect(res.valid).toBe(true);
    expect({}.polluted).toBeUndefined();
    expect(res.value.traits).toEqual({ courage: 0.9 });
  });

  it('silently drops invalid batch members while keeping valid ones', () => {
    const res = ProtocolValidator.validateBatchTick({
      type: MESSAGE_TYPES.BATCH_TICK_REQUEST,
      observations: [{ ...VALID_OBS }, { x: 1 }, null, 42, { ...VALID_OBS, agent_id: 'a2' }],
    });
    expect(res.valid).toBe(true);
    expect(res.value.observations.map((o) => o.agent_id)).toEqual(['a1', 'a2']);
  });

  it('pins version tolerance: same-major accepted, major mismatch rejected', () => {
    const major = PROTOCOL_VERSION.split('.')[0];
    const ok = ProtocolValidator.validateHandshake({ type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: `${major}.99.99` });
    expect(ok.valid).toBe(true);
    const bad = ProtocolValidator.validateHandshake({ type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '999.0.0' });
    expect(bad.valid).toBe(false);
  });

  it('pins unknown-type permissiveness (forward-compat default, typos pass)', () => {
    // Finding, not endorsement: unknown types validate true so future
    // versions keep working. A typo'd type will NOT be caught here.
    const res = ProtocolValidator.validateIncomingMessage({ type: 'OBSERVATON_DISPACH', agent_id: 'a1' });
    expect(res.valid).toBe(true);
  });

  it('explicit handshake ids round-trip deterministically', () => {
    const a = ProtocolValidator.validateHandshake({ type: MESSAGE_TYPES.HANDSHAKE_REQUEST, client_id: 'c1' });
    const b = ProtocolValidator.validateHandshake({ type: MESSAGE_TYPES.HANDSHAKE_REQUEST, client_id: 'c1' });
    expect(a).toEqual(b);
  });

  it('survives a 200k-threat flood without hanging or throwing', () => {
    const threats = new Array(200000).fill(null).map((_, i) => ({ type: 'PREDATOR', distance: i % 100, intensity: 0.5 }));
    const t0 = Date.now();
    let res;
    expect(() => { res = ProtocolValidator.validateObservation({ ...VALID_OBS, threats }); }).not.toThrow();
    expect(Date.now() - t0).toBeLessThan(15000);
    expect(res.value.threats).toHaveLength(200000);
  }, 60000);

  it('binary decoder rejects garbage without allocating or hanging', () => {
    expect(() => BinaryWireProtocol.decodeObservationBatch(new ArrayBuffer(0))).toThrow();
    const badMagic = new ArrayBuffer(16);
    expect(() => BinaryWireProtocol.decodeObservationBatch(badMagic)).toThrow(/magic/i);
    // Absurd entity count in a 16-byte buffer: length check fires first,
    // so no giant array is ever allocated.
    const view = new DataView(new ArrayBuffer(16));
    view.setUint32(0, BINARY_MAGIC, true);
    view.setUint8(4, BINARY_PROTOCOL_VERSION);
    view.setUint32(12, 0xffffffff, true);
    const t0 = Date.now();
    expect(() => BinaryWireProtocol.decodeObservationBatch(view.buffer)).toThrow(/runcated/i);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
