---
title: "Fear AI v0.1.0-rc3 - Release Notes"
created: 2026-10-20
type: release-notes
status: active
---

# Fear AI v0.1.0-rc3 - Release Notes

**Status: PROVISIONAL / NOT CERTIFIED.** This is a security and packaging-
correction release on the same frozen RC1 surface. It does not close the RC1
certification gate, does not add engine scope, and does not promote Unity or
Unreal beyond their recorded states.

`v0.1.0-rc3` supersedes `v0.1.0-rc2`. RC2 assets are retained for provenance but
are **not** the recommended download: the RC2 Unity zip's quick-start tells users
to copy duplicate root `.cs` files, and the RC2 source predates the dashboard
remote-bind guard and the `sprintf-js` removal.

## What changed from RC2

- **The dashboard now refuses a public bind by default.** `DesignerDashboardServer`
  applies the same guard as `FearServer`: `0.0.0.0` and `::` are reset to
  `127.0.0.1` unless the caller explicitly passes `allowRemoteAccess: true`. The
  dashboard is unauthenticated and read-only; read-only routes were never a
  network boundary. `fear-ai dashboard` exposes no remote-access switch, so its
  CLI path is loopback-only.
- **The `sprintf-js` advisory is removed from the root dependency tree.** An
  `argparse@2.0.1` override replaces the `argparse@1.0.10` that
  `@tensorflow/tfjs@4.22.0` declared and drops `sprintf-js` entirely.
  `npm audit` now reports **0 vulnerabilities**. This is a lockfile override, not
  an upstream `sprintf-js` patch; the published RC2 tag still contains the old
  chain.
- **The Unity quick-start is corrected.** It now says to use the release zip or
  copy `Runtime/` only. The root `.cs` files are byte-identical probe copies and
  must not be imported alongside `Runtime/`, which would make Unity compile the
  same types twice.
- **`SECURITY.md` distinguishes RC2 from RC3.** The dashboard guard and the
  dependency fix are stated as post-RC2 changes, and the remaining `glib` alert
  is not represented as fixed.

No host-authority boundary changed. Adapters still emit advisory intents and
vector hints only; the host owns movement, physics, combat, damage, inventory and
spawning.

## Evidence at this release

- **60 standalone probes: 59 passed, 1 declared skip, 0 failed** on the declared
  toolchain (Node 24.20.0 locally; CI run `39536076771` on code commit
  `eab3025` was green). The skip is `verify_unity_editor_tests.mjs`: no Unity
  Editor has executed the EditMode fixtures.
- `verify:hard-rule-9` is **28/28**, `guardian:check` is **CLEAN**,
  `verify:release-claims` is **SUCCESS**, and `npm run build` is green. The main
  chunk remains about 2.04 MB (537.85 kB gzip), above Vite's 500 kB warning
  threshold but not a correctness failure.
- `npm audit` reports **0 vulnerabilities**. One medium Dependabot alert remains:
  `glib 0.18.5` in the Linux Tauri/GTK stack.
- `npm run verify:adapters-package` passes **6/6** on the release package set:
  tracked-file scope, manifests, checksums, LICENSE, and no local absolute paths.
- Rust SDK `cargo check` was green at RC2 and no Rust source changed in this
  release; it is not claimed as a fresh RC3 run.

## Known limits

- **Guardian acceptance is stale.** `docs/guardian/ACCEPTED_STATE.json` is the
  2026-08-29 baseline: 17 domains remain `PENDING_AUDIT`, with 5 P0 and 4 P1
  questions. The passing probes reference the P0 contract IDs, but coverage is
  not acceptance. Only the owner can advance this file.
- **Unity Editor remains unexecuted.** The adapter is
  `IMPLEMENTED_NOT_EDITOR_VERIFIED`; the shim run is real evidence for the
  behavior it exercises, not for Unity's Editor lifecycle.
- **Unreal is deferred.** The adapter is kept so Unreal games can connect later;
  no UE5 compile or run is claimed.
- **Cross-tree parity is PARTIAL in CI.** The local host run can reach the Rust
  `fear.rs` tree; the nightly runner cannot, so the probe reports PARTIAL rather
  than PASS there.
- **No desktop smoke test.** Electron is configured with
  `nodeIntegration:false`, `contextIsolation:true` and `sandbox:true`, but the
  app is not launched in CI. Tauri is not built in CI.
- **Security is bounded, not certified.** The middleware and dashboard bind
  loopback by default and speak plain HTTP/WebSocket. Request signing exists but
  the default policy is `preferred`, not `required`; it is not TLS and does not
  encrypt the wire. CORS remains permissive
  (`Access-Control-Allow-Origin: *`) to support browser/WebGL hosts. The `glib`
  medium advisory remains because Tauri's GTK stack pins it; no security
  certification is claimed.
- **The RC1 release dossier remains open.** Its verdict is
  **PROVISIONAL / NOT CERTIFIED**, and this release does not change that.

## Assets

| Asset | Contents |
|---|---|
| `fear-ai-unity.zip` | Unity UPM adapter source, LICENSE, package manifest |
| `fear-ai-godot.zip` | Godot 4 plugin source, LICENSE, package manifest |
| `fear-ai-unreal.zip` | Unreal Engine 5 plugin source, LICENSE, package manifest |
| `fear-ai-csharp.zip` | C# client source and conformance example, LICENSE, package manifest |
| `fear-ai-python.zip` | Python reference client, LICENSE, package manifest |
| `fear-ai-rust.zip` | Rust SDK source, LICENSE, LICENSE-NOTE, package manifest |
| `CHECKSUMS.sha256` | SHA-256 for each zip |
| `RELEASE_MANIFEST.json` | Source commit, package list, sizes and hashes |
| `LICENSE` | Repository MIT license |

## Verify a download

Linux/macOS:

```bash
sha256sum -c CHECKSUMS.sha256
```

Windows PowerShell:

```powershell
Get-Content CHECKSUMS.sha256 | ForEach-Object {
  $hash, $name = $_ -split '\s+', 2
  $actual = (Get-FileHash $name -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $hash) { throw "checksum mismatch: $name" }
}
```

Then inspect `RELEASE_MANIFEST.json` and the `PACKAGE_MANIFEST.json` inside each
zip. The source commit recorded there must match the commit tagged
`v0.1.0-rc3`.

## Component versions

The release tag is a repository release label, not an npm package version. The
component manifests retain their independent versions: `@fear-ai/core`,
`@fear-ai/runtime` and `@fear-ai/protocol` are `1.0.0`; the Unity, Godot,
Unreal and C# adapters are `1.0.0`; the Rust adapter is `0.1.0`; the Tauri
desktop shell is `2.0.0`; the private root research package is `0.0.0`.

## License

MIT. The Rust adapter's `Cargo.toml` declares `MIT OR Apache-2.0`; the package
includes the MIT text, and the upstream source remains dual-licensed.
