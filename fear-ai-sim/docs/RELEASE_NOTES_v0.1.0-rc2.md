---
title: "Fear AI v0.1.0-rc2 - Release Notes"
created: 2026-10-20
type: release-notes
status: active
---

# Fear AI v0.1.0-rc2 - Release Notes

**Status: PROVISIONAL / NOT CERTIFIED.** This is a packaging and provenance
release. It does not close the RC1 certification gate, does not add engine
scope, and does not promote Unity or Unreal beyond their recorded states.

`v0.1.0-rc2` supersedes `v0.1.0-rc1`. The RC1 zips are retained for provenance
but are **not** suitable for use: they contain build outputs, local tool paths,
and no LICENSE or published checksums.

## What changed from RC1

- **Packages contain tracked source only.** The packer reads `git ls-files` for
  each adapter and rejects `bin/`, `obj/`, `target/`, `__pycache__/`,
  `node_modules/` and `dist/`. The previous Rust package was 29 MB because it
  contained 401 `target/` entries; the C# package contained compiled assemblies,
  PDBs and `Conformance.exe`; the Python package contained `.pyc` files.
- **Every package carries a LICENSE.** The repository now has an MIT `LICENSE`,
  and each zip includes it. The Rust adapter remains dual-licensed
  `MIT OR Apache-2.0`; the packaged LICENSE text is the MIT option.
- **The Unity package no longer ships duplicate root and `Runtime/` sources.**
  Seven root `.cs` files are byte-identical to their `Runtime/` counterparts;
  including both would make Unity compile the same types twice. The package
  scope excludes the root copies with a recorded reason, and the manifest lists
  them under `excludedSourceFiles`.
- **Every package carries `PACKAGE_MANIFEST.json`.** The manifest records the
  source commit, tracked file list, per-file SHA-256 and byte count, and the
  license expression.
- **Release-level provenance is published.** `RELEASE_MANIFEST.json` and
  `CHECKSUMS.sha256` are release assets. `npm run verify:adapters-package`
  re-reads the zips and checks the tracked-file set, manifest hashes, LICENSE,
  checksums and absence of local absolute paths.
- **Build and packaging are CI gates.** `.github/workflows/package.yml` runs
  `npm ci`, `npm run build`, `npm run pack:adapters` and
  `npm run verify:adapters-package` on every PR and default-branch push. This is
  a release-integrity workflow, not a test suite; verification remains manual.
- **Public claims are corrected below.** The release is not "universal", not
  "hardened CORS", and not an RC certification.

## Evidence at this release

- **60 standalone probes: 59 passed, 1 declared skip, 0 failed** on the
  declared toolchain (`vite@8.3.4`, `electron@41.10.6`, Node 24.20.0). The skip
  is `verify_unity_editor_tests.mjs`: no Unity Editor has executed the EditMode
  fixtures.
- The nightly ledger has **9 recorded nights / 1,152 probe attempts**, with
  **0 failures and 0 probes that disagreed with themselves**. The last three
  nights use the same 60-probe roster and carry three durations per probe.
- The 41 Unity EditMode fixture cases compile and run against the Unity shims;
  that is **not** an Editor result and does not close the Editor gap.
- `npm run build` is green; the main chunk is about 2.04 MB (537.85 kB gzip),
  above Vite's 500 kB warning threshold but not a correctness failure.
- `verify:hard-rule-9` is 28/28, `guardian:check` is CLEAN, and the release
  dossier, maturity map, Godot fallback and Rust oracle checks are current.
- Rust SDK `cargo check` passes.

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
- **Security is bounded, not certified.** The middleware binds loopback and
  speaks plain HTTP/WebSocket; request signing is optional (`preferred` by
  default), CORS is permissive (`Access-Control-Allow-Origin: *`) to support
  browser/WebGL hosts, and there is no TLS. Two medium Dependabot alerts remain
  (`glib` in `src-tauri`, `sprintf-js` through the root research-sim tfjs
  chain); `npm audit` reports 3 moderate advisories. No security certification
  is claimed.
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
`v0.1.0-rc2`.

## Component versions

The release tag is a repository release label, not an npm package version. The
component manifests retain their independent versions: `@fear-ai/core`,
`@fear-ai/runtime` and `@fear-ai/protocol` are `1.0.0`; the Unity, Godot,
Unreal and C# adapters are `1.0.0`; the Rust adapter is `0.1.0`; the Tauri
desktop shell is `2.0.0`; the private root research package is `0.0.0`.

## License

MIT. The Rust adapter's `Cargo.toml` declares `MIT OR Apache-2.0`; the package
includes the MIT text, and the upstream source remains dual-licensed.
