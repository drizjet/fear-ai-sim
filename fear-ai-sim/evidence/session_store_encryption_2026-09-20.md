# The Persisted Credential and Signing Key, Unreadable at Rest — 2026-09-20

**Scope:** the persisted session credential and the host's private signing key are
now written as an authenticated, encrypted container by default, in all three
adapters that persist anything. Middleware and adapter contracts only — this is
**not** a TLS, confidentiality-on-the-wire, hardware-backed-key, or
host-integration claim, and the limits say exactly where it stops.

## 1. The limitation this closes

The previous entry recorded request signing as closing the "a leaked token is
enough" edge. It did, on the SERVER side. The host side was left open, and the gap
was written down rather than hidden:

> persistence is currently plaintext by design... **signing authenticates requests
> and makes them non-replayable, and does nothing for confidentiality** — payloads
> stay plaintext, the private key is unencrypted when persisted.

That was the sharpest remaining edge in the layer, because it pointed the wrong
way. A private key on disk protects the crowd against a lifted token, and a
plaintext private key on disk hands the attacker the stronger of the two
credentials. Worse, it was in the *accumulating* file: `user://` for Godot,
`Application.persistentDataPath` for Unity — the game's own save tree, which is
inside every backup, every synced folder, every support bundle and every crash
dump. The credible leak was never an attacker with a shell; it was a folder that
got copied somewhere it should not be.

## 2. What the container is, and what it deliberately is not

    FEAR-AI-STORE-V1
    kdf=pbkdf2-hmac-sha256
    iter=<integer>
    salt=<base64, 16 bytes>
    cipher=aes-256-cbc
    iv=<base64, 16 bytes>
    name=<the session NAME, in the clear>
    ct=<base64>
    mac=<base64, 32 bytes>

AES-256-CBC with PKCS#7 applied **by the format, not by the library**, and an
HMAC-SHA256 over every byte from the start of the file through the newline that
ends the `ct=` line. `iter` is read from the file, never assumed, so a writer may
choose its own cost and a reader still obeys the artifact.

`name` is plaintext **on purpose**. The ownership model already rests on a name not
being a credential — `session_id` is host-chosen and guessable, and it is the token
that proves continuity — so keeping it readable costs nothing real and answers the
first question anyone asks of a stray store: *which host is this?* It is inside the
MAC, so it cannot be edited.

What it buys, precisely:
1. **Relocation.** The store alone is useless on another machine or in a backup,
   because the key is not in the file and not in the same directory tree.
2. **Casual inspection.** Searching a support bundle finds no credential and no
   PEM banner.
3. **Tampering by editing.** The envelope is authenticated, so a hand-edited store
   is refused instead of half-honoured.

What it does **not** buy: anything against someone who can read BOTH the store and
the keyring on the same machine. That person can decrypt it. There is no hardware
backing, no OS keystore integration, and no file permissions are set from the
adapters on Windows because there is no mode to set there. Those are limits of the
claim, not caveats to be softened later.

The keyring therefore lives in a **user-scoped configuration path**
(`%APPDATA%/FearAI`, `~/.config/fear-ai`, `~/Library/Application Support/FearAI`)
while the store stays wherever the host puts it — `user://` in Godot, the host's
chosen path in Unity — so a backup of the save tree does not carry the key.
`FEAR_AI_KEYRING` and each adapter's own path setting override it, which is how the
probes pin two processes to one keyring deliberately.

Encryption is **on by default for every host that already opted into persistence**.
No host has to ask for it, which is the "without the host's involvement" half of
the requirement: the only thing that changed is where the credential is written,
and the only way to get plaintext back is to set `session_store_allow_plaintext`
(or `AllowPlaintext`) explicitly and then read `PLAINTEXT_BY_REQUEST` back from the
reported protection level.

## 3. Three interop traps, all found by running it

None of these were visible by reading the code, and a cross-language container is
worthless if any of them is left in.

1. **PADDING IS THE CALLER'S JOB.** Node's `createCipheriv` pads PKCS#7
   automatically; Godot's `AESContext` does not, and for input that is not a
   multiple of the block size it returns **zero bytes** rather than erroring — a
   silent empty result that decodes as a corrupt store. A 32-byte plaintext became
   32 bytes on one side and 48 on the other. Padding is now explicit on all three
   sides and Node's automatic padding is disabled.
2. **The MAC covers the text as SENT**, not a rebuild of it. Both sides hash the
   exact file text, which removes any canonicalisation step for two languages to
   disagree about.
3. **JSON KEY ORDER IS NOT PORTABLE.** This one cost a debug cycle and is the best
   argument for byte-identity as the assertion. Godot's `JSON.stringify` **sorts**
   object keys by default; Node emits insertion order. The keys, the values and the
   length were all correct and the ciphertext still diverged from its **second
   base64 character** — which presents as "the other runtime used a different key"
   and is nothing of the sort. Neither default is wrong; depending on either is.
   The payload is now canonicalised (keys sorted) by the Node writer, by C# built
   by hand in sorted order, and by Godot with `sort_keys = true` passed
   **explicitly** rather than relied on. Only bytes inside the ciphertext changed,
   so a reader — which parses JSON and does not care about order — still opens
   containers written before the change.

## 4. Evidence

### 4.1 The container itself — `npm run verify:store-encryption` (46 assertions)

Two writers other than Node are exercised, and each is SKIPPED rather than PASSED
when its runtime is absent, so no record can claim coverage that did not happen.

- **Format and refusals (Node).** Version/KDF/cipher lines; the credential and the
  private key absent from the file **bytes**; the name present and readable through
  the supported accessor; the vector deliberately *not* a whole number of blocks so
  padding is actually exercised; the ciphertext grown to the next block boundary and
  no further; a wrong passphrase, an edited plaintext name, one flipped ciphertext
  character, a truncated file, an empty file, a foreign version line, a downgraded
  cipher and a newline in the name all refused **for a reported reason**.
- **The keyring.** Created on demand, 256 bits, the same key returned on the next
  load rather than a fresh one, holding no credential — and the relocation claim
  asserted directly: a container keyed from one keyring opens with that keyring and
  **a copy of the store without it is inert**.
- **Godot 4.6, in engine.** `tests/godot_project/run_store_encryption.gd` decrypts
  the container the Node reference wrote, asserts the plaintext name is readable
  without the passphrase while the credential and key are not, exercises the same
  refusal surface, and writes its own container from pinned inputs. 37 in-engine
  assertions. Then, **for the same inputs, Godot and Node produce BIT-IDENTICAL
  containers**, and Node decrypts the engine-written file.
- **C# — compiled and RUN with no Editor installed.** The container was kept free
  of any `UnityEngine` dependency so it could be compiled and executed as an
  ordinary console program on a machine with no Editor. It decrypts the
  Node-written container, recovers the same name, credential and key, and its own
  output is **bit-identical** to Node's. This is the only way a container shared by
  three runtimes gets checked where the Editor does not exist.

### 4.2 The round trip across a restart, in engine —
`npm run verify:host-token-persistence` (44 assertions, 6 engine processes)

The pre-existing cross-process probe was extended rather than replaced, so the
restart evidence is the same evidence, now read against the encrypted file:

- **Phase 1.** A fresh host claims a crowd and the store must come out as the
  container, **not** JSON. The credential is absent from the file; no private-key
  PEM banner survives; a **stranger keyring cannot open it**; the keyring file is
  real and is **not in the store's directory**; and the credential is read back
  **out of process, by the Node reference, with the keyring alone** — which is what
  separates "a file of ciphertext" from "a store the tooling can read".
- **Phase 2.** A NEW engine process, same store, same live server: the crowd is
  reclaimed as **GRANTED**, not adopted, and the store still exposes nothing.
- **Phase 3.** The middleware restarts from a snapshot and a third process returns:
  a credential hashed in a **previous server process** still proves continuity, and
  the store survived it still unreadable at rest.
- **Phase 4 (new).** The upgrade path, with no server involved: an older build's
  **plaintext** store is read, reported as `PLAINTEXT_LEGACY` rather than silently
  accepted, and the ordinary `save_session()` that runs on the next credential
  issue **rewrites it encrypted in place**. Node then confirms the file was really
  replaced and still carries the same credential. In place matters: a migration
  needing a separate tool would leave real hosts readable on disk until they ran it.
- **Phase 5 (new).** The **private signing key**. Signing is turned on, the key is
  written through the encrypted store, the file exposes neither the credential nor
  the key nor even a PEM banner, and a second client standing for the restart reads
  the key back **verbatim** — asserted as "the stored key loaded" and "the same
  fingerprint", because `_ensure_signing_key` would otherwise generate a *new* key
  and the host would silently present a key the server no longer holds. Node then
  imports the recovered PEM as a real RSA key and checks it against the public half
  stored beside it.

### 4.3 Unity, executed — `npm run verify:unity-behavior` (37 assertions, 4 processes)

A fourth phase was added to the existing behavioural harness (which runs the real
adapter against a live server, no Editor, engine shimmed):

- The adapter writes the credential **and the exported `FEAR-AI-RSA1` private key**
  through `FearEncryptedSessionStore`; the file is the container, not the JSON the
  harness used to write, the credential is not in it, and no PEM banner is.
- A NEW client over the same file loads the credential and the key, and — the
  assertion the phase exists for — `EnableSigning()` **adopts the stored key**
  instead of generating a new one. Without that ordering the restart would look
  successful and leave the host unable to sign at all.
- The probe then reads the same file from **outside the adapter** with the Node
  reference and the keyring alone: the credential comes back, the key comes back as
  `FEAR-AI-RSA1` text, and a copy of the store without its keyring is inert.

### 4.4 Everything else re-run at the same state

All 25 standalone probes exit 0 at this state, including the eight that predate
this change and could plausibly have been disturbed by it: the Godot station and
fallback verifiers, the 210-assertion adapter conformance sweep, the dashboard
endpoints probe, protocol abuse, server lifecycle and reconnect, and the fuzz
arbitrator. All four live in-engine Godot suites pass (`godot:evidence`: 13/13,
3/3, 4/4, 38/38). The Unity EditMode **tests compile** in the .NET compile gate;
whether they pass stays an Editor question. `verify:unity-editor` reports SKIPPED
on this machine, as it must.

No automated test runner was used, per Hard Rule 9.

## 5. What this does not establish

- **Not confidentiality on the wire.** Payloads are still plaintext; this changes
  what is readable in a FILE at rest, nothing else.
- **Not a leak on a shared machine.** Anyone who can read both the store and the
  keyring can decrypt it. Encrypting the store removes a leaked *folder* as a way
  in; it does not remove a leaked *machine*.
- **Not hardware-backed.** No TPM, no OS keystore, no per-user ACL. The keyring is
  a file with the platform's default permissions, and on Windows the adapters set
  no mode at all.
- **Not Python or the standalone C# client.** Neither persists a session
  credential, so neither was given a store. Python's `key_path` is a host-directed
  PEM for the signing key and is unchanged — a host using it is still storing a
  plaintext private key, and the adapters' docs say so.
- **Not Unity Editor behaviour.** The store is compiled by the compile gate and
  EXECUTED by the behavioural harness, both outside the Editor. The Unity row keeps
  `IMPLEMENTED_NOT_EDITOR_VERIFIED`, and the EditMode tests remain compiled-only
  here.
- **Not a claim about the binary wire**, which carries no session identity at all,
  so a key cannot gate it.

## 6. The honest one-line summary

A persisted session credential and private signing key are now ciphertext in a
container that travels nowhere useful without a keyring kept in a different tree,
the same container is produced bit-for-bit by Node, Godot and C#, and the round
trip across a host restart — and across a middleware restart — still produces a
`GRANTED` reclamation of the same crowd with the same signing key.
