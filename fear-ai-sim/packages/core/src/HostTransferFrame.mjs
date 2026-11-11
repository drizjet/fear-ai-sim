// Trusted simulation ingress for untrusted-host *transport data*, not a
// serializer for arbitrary JavaScript objects. The untrusted producer must
// run outside the trusted simulation realm/process and send a primitive JSON
// string over its authenticated transport. Never call JSON.stringify,
// structuredClone, Reflect, or any other property operation on a caller
// object: a Proxy can execute code even during validation.
//
// This module is intentionally JSON-only. Native views, Map/Set, cyclic
// references, and callable host objects belong to the separately documented
// trusted in-process direct-snapshot path, not this cross-boundary protocol.
const nativeParse = JSON.parse;
export const HOST_TRANSFER_MAX_CODE_UNITS = 262144;
const MAX_DEPTH = 32;
const MAX_NODES = 4096;
const MAX_FIELDS = 256;
const MAX_ARRAY = 2048;
const MAX_STRING = 16384;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor', 'toJSON']);

function own(record, key) {
    return Object.getOwnPropertyDescriptor(record, key)?.value;
}

// Input has already been parsed by the native JSON parser, without a reviver:
// no host-origin JS reference can exist anywhere in this graph. Rebuild into
// local data-only records with null prototypes, for both prototype-safety and
// to prevent inherited JSON callbacks on the transferred record itself.
function detachedJsonValue(input) {
    const parent = { value: null };
    const pending = [{ src: input, dst: parent, key: 'value', depth: 0 }];
    let nodes = 0;
    while (pending.length) {
        const { src, dst, key, depth } = pending.pop();
        if (++nodes > MAX_NODES || depth > MAX_DEPTH)
            throw new Error('host transfer graph exceeds bounds');
        if (src === null || typeof src === 'boolean') {
            dst[key] = src;
        } else if (typeof src === 'string') {
            if (src.length > MAX_STRING) throw new Error('host transfer string too long');
            dst[key] = src;
        } else if (typeof src === 'number') {
            if (!Number.isFinite(src))
                throw new Error('host transfer nonfinite number');
            dst[key] = src;
        } else if (Array.isArray(src)) {
            if (src.length > MAX_ARRAY) throw new Error('host transfer array too long');
            const out = new Array(src.length);
            dst[key] = out;
            for (let i = src.length - 1; i >= 0; i--)
                pending.push({ src: src[i], dst: out, key: i, depth: depth + 1 });
        } else if (typeof src === 'object') {
            const keys = Object.keys(src);
            if (keys.length > MAX_FIELDS) throw new Error('host transfer record too wide');
            const out = Object.create(null);
            dst[key] = out;
            for (let i = keys.length - 1; i >= 0; i--) {
                const child = keys[i];
                if (child.length > MAX_STRING || FORBIDDEN_KEYS.has(child))
                    throw new Error('host transfer forbidden metadata key');
                pending.push({ src: own(src, child), dst: out, key: child, depth: depth + 1 });
            }
        } else {
            // Unreachable for JSON.parse without a reviver, but fail closed.
            throw new Error('host transfer unsupported value');
        }
    }
    return parent.value;
}

function shape(value, required, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('invalid host transfer ' + label);
    const keys = Object.keys(value);
    if (keys.length !== required.length ||
        keys.some(key => !required.includes(key)))
        throw new Error('invalid host transfer ' + label);
}

// There is deliberately no object-input overload and no implicit coercion.
// Even a Proxy with hostile ownKeys, descriptor, get, prototype and toJSON
// traps is refused at the typeof check, without invoking any of them.
export function decodeHostTransferFrame(wire) {
    if (typeof wire !== 'string')
        throw new TypeError('host transfer requires primitive JSON string');
    if (wire.length === 0 || wire.length > HOST_TRANSFER_MAX_CODE_UNITS)
        throw new Error('host transfer frame exceeds size limit');
    let parsed;
    try {
        parsed = nativeParse(wire);
    } catch {
        throw new Error('invalid host transfer JSON');
    }
    const frame = detachedJsonValue(parsed);
    shapeRecord(frame, 'envelope');
    const kind = own(frame, 'kind');
    if (kind === 'event') {
        shape(frame, ['version', 'kind', 'type', 'tick', 'details'], 'event');
        if (own(frame, 'version') !== 1 || typeof own(frame, 'type') !== 'string' ||
            own(frame, 'type').length === 0 ||
            !Number.isSafeInteger(own(frame, 'tick')) || own(frame, 'tick') < 0)
            throw new Error('invalid host transfer event fields');
        shapeRecord(own(frame, 'details'), 'event details');
    } else if (kind === 'cargo') {
        shape(frame, ['version', 'kind', 'entityId', 'cargo'], 'cargo');
        if (own(frame, 'version') !== 1 ||
            typeof own(frame, 'entityId') !== 'string' ||
            own(frame, 'entityId').length === 0 ||
            own(frame, 'entityId').length > 256)
            throw new Error('invalid host transfer entity ID');
        shapeRecord(own(frame, 'cargo'), 'cargo data');
    } else {
        throw new Error('unsupported host transfer kind');
    }
    return frame;
}

function shapeRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('invalid host transfer ' + label);
}
