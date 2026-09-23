# Legacy source extraction — provenance

Files in this directory are **byte-exact extractions** from the legacy monorepo tree on
`origin/master` (branch `master`, subtree `fear-ai-sim/`), extracted under
`RESP-SOURCE-ABSENT-RECONCILIATION-001`'s documented re-open procedure
(`docs/SOURCE_ABSENT_RECONCILIATION.md`). They are *evidence and reference* — V8 integrations
live in the production modules and are pinned by their own test suites; nothing here is
imported by production code.

| file | upstream path | blob | sha256 | extracted |
| --- | --- | --- | --- | --- |
| `legacy/habituation.js` | `origin/master:fear-ai-sim/` + `habituation.js` | `df69efd8bf62c1b7ac38161fcdb9e9909e764c5d` | `df02134b9227043baca61698a1a4f7d3b0cf6ce477667acd511e04a8d812db27` | 2026-09-23 |

Extraction command (reproduce and diff against the sha256 above):

```sh
git show origin/master:fear-ai-sim/habituation.js | sha256sum
```

Byte-exactness of every file in this directory is asserted on each gate run by
`tests/habituation-reopen.test.js` (and `.gitattributes` marks `legacy/**` as `-text` so no
line-ending conversion can ever touch the bytes).

Wall-clock note: the legacy sources use `Date.now()`; V8 integration replaces the wall clock
with the society's world time (`this.now()`), per the repository's no-wall-clock rule for
production modules.
