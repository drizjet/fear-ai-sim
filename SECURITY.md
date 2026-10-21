# Security Policy

Fear AI is a **provisional release candidate**, not a security-certified product.
This page records the security boundary that the code actually enforces and the
known gaps that remain. It is a disclosure document, not a claim that the
middleware is safe to expose to an untrusted network.

This policy describes the post-RC2 `master` tree. The `v0.1.0-rc2` tag predates
the dashboard remote-bind guard described below; the other boundary statements
apply to both.

## Default boundary

- `FearServer` defaults to `127.0.0.1:8765`. A request to bind `0.0.0.0` or `::`
  is refused and reset to loopback unless the caller explicitly passes
  `allowRemoteAccess: true`.
- `DesignerDashboardServer` defaults to loopback and, on current `master`,
  refuses `0.0.0.0` / `::` unless the caller explicitly passes
  `allowRemoteAccess: true`, matching `FearServer`. The `v0.1.0-rc2` tag
  predates that guard; do not configure the rc2 dashboard with a public bind.
- The middleware speaks plain HTTP/WebSocket. There is no TLS. Request signing
  exists, but the default policy is `preferred`, not `required`; it is not
  confidentiality and does not encrypt the wire.
- Both HTTP surfaces send `Access-Control-Allow-Origin: *`. This is deliberate
  so browser/WebGL hosts can connect, but it means **any web origin can attempt
  requests against the loopback server**. Loopback is a network boundary, not
  authentication. Do not expose the port, and do not browse untrusted content
  in the same browser session while the middleware or dashboard is running.
- The designer dashboard is intended to be read-only and has no
  authentication. It is a local observability surface, not a public service.

The host game remains authoritative for movement, physics, combat, and all
other game state. Fear AI emits advisory data only.

## Known open advisories

At the `v0.1.0-rc2` tag:

| Dependency | Severity | Where | Status |
|---|---|---|---|
| `glib 0.18.5` | Medium (`GHSA-wrw7-89jp-8q8g`) | `src-tauri/Cargo.lock`, Linux Tauri UI stack | Open. `glib` is pinned by the `gtk 0.18` / `webkit2gtk` stack used by Tauri; upgrading only `glib` to the patched `0.20.x` line is not compatible with that stack. It is not present on the Windows target build. |
| `sprintf-js 1.0.3` | Medium (`GHSA-hp3w-g68c-fv3c`) | root `package-lock.json` via `@tensorflow/tfjs@4.22.0 -> argparse@1.0.10` | Open. No patched `sprintf-js` release is published. The dependency is in the research-simulation dependency chain; this document does not claim it is unreachable. |

`npm audit` reports three moderate advisories for the root dependency tree.
These advisories are not fixed by this release and are not represented as fixed
in the release notes.

## Reporting

Please report suspected vulnerabilities privately rather than opening a public
issue with exploit details. Use the repository's private vulnerability reporting
if it is enabled, or contact the maintainer directly through the repository
profile. Include the affected commit, a minimal reproduction, and whether the
server was bound to loopback or a public interface.

## Scope

This policy covers the JavaScript middleware, the Tauri/Electron shells, the
engine adapters, and the packaging scripts in this repository. The Unity adapter
has not been executed inside the Unity Editor, and the Unreal adapter is
deferred and source-only; no engine-level security guarantee is made for either.
