/**
 * RequestSigner — the host side of `RequestSigning`, in Node.
 *
 * This is the reference implementation of the signing contract, and it exists so
 * the contract can be exercised from JavaScript (probes, the CLI, tests) as well
 * as from the engine adapters. The adapters do not share code with this file;
 * they reimplement the same byte-for-byte canonical string, and
 * `verify_transport_signing.mjs` is what keeps the languages honest: every
 * adapter's signature is checked by the real server, and a broken canonical
 * string in any one of them fails that probe.
 *
 * Keys are generated HERE, on the host, and only the public half is ever sent.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import {
    canonicalHttpInput,
    canonicalWsInput,
    publicKeyFingerprint,
    sha256Hex,
    SIGNATURE_ALGORITHM,
    SIGNATURE_HEADERS
} from './RequestSigning.js';

/** RSA-2048: the most widely implemented size, and fast enough for a control plane. */
export const SIGNING_KEY_MODULUS_BITS = 2048;

/**
 * Generate a host keypair.
 *
 * `keyId` is derived from the public key, so it is reproducible from the PEM and
 * a host can recognise its own key after a restart without keeping a second file.
 */
export function generateSigningKeyPair(modulusLength = SIGNING_KEY_MODULUS_BITS) {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey, keyId: publicKeyFingerprint(publicKey) };
}

/** A fresh hex nonce. 128 bits is far more than enough for a skew window. */
export function makeNonce(size = 16) {
    return randomBytes(size).toString('hex');
}

function signMessage(privateKeyPem, message) {
    const key = createPrivateKey(privateKeyPem);
    return cryptoSign('sha256', Buffer.from(message, 'utf8'), key).toString('base64');
}

/**
 * Produce the signature headers for an HTTP control request.
 *
 * `body` is the exact text that will be sent (the caller stringifies once and
 * sends that same string), because the signature covers the request's bytes, not
 * its meaning.
 */
export function signHttpRequest({
    method,
    target,
    body = '',
    sessionId,
    privateKeyPem,
    issuedAt = Date.now(),
    nonce = makeNonce(),
    // Passed in by `createSigner` so a signing loop does not re-derive the
    // public key from the private key on every request.
    keyId = null
}) {
    const message = canonicalHttpInput({
        method,
        target,
        bodyHash: sha256Hex(body),
        sessionId,
        issuedAt,
        nonce
    });
    return {
        [SIGNATURE_HEADERS.session]: String(sessionId),
        [SIGNATURE_HEADERS.issuedAt]: String(issuedAt),
        [SIGNATURE_HEADERS.nonce]: nonce,
        [SIGNATURE_HEADERS.signature]: signMessage(privateKeyPem, message),
        [SIGNATURE_HEADERS.algorithm]: SIGNATURE_ALGORITHM,
        [SIGNATURE_HEADERS.keyId]: keyId || publicKeyFingerprint(exportPublicKey(privateKeyPem)) || ''
    };
}

/** The SPKI PEM for a private key, so a host can publish what it already holds. */
export function exportPublicKey(privateKeyPem) {
    const key = createPrivateKey(privateKeyPem);
    return createPublicKey(key).export({ type: 'spki', format: 'pem' });
}

/** Sign a WebSocket challenge. One signature per connection, not per message. */
export function signChallengeResponse({ challenge, sessionId, privateKeyPem }) {
    return signMessage(privateKeyPem, canonicalWsInput({ challenge, sessionId }));
}

/** A convenience handle bundling a keypair with its signing methods. */
export function createSigner({ privateKeyPem, publicKeyPem = null, keyId = null } = {}) {
    const pub = publicKeyPem || exportPublicKey(privateKeyPem);
    return {
        publicKeyPem: pub,
        keyId: keyId || publicKeyFingerprint(pub),
        signHttpRequest: (args) => signHttpRequest({ ...args, privateKeyPem }),
        signChallengeResponse: (args) => signChallengeResponse({ ...args, privateKeyPem })
    };
}
