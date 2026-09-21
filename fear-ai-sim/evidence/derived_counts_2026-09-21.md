# The Counts Are Derived, Not Remembered — 2026-09-21

**Scope:** one new integrity check, `documented-counts-match-the-derived-counts`, and the three
claim sites it reads. It exists because four release-facing counts were wrong inside one week and
**every one of them was found by reading**, never by a failing check.

## The failure this closes

Every check in `tools/guardian/hard-rule-9.mjs` before this one asks some version of "does this
sentence still exist?" That is the right question for a claim boundary and the wrong one for a
count, because a count is a claim about *now* that quietly stops being true:

| When | Claim | Reality |
|---|---|---|
| §29 prose | "the gate total is 19 checks" | 22 |
| §31 prose | "19/19" | 22 |
| §32-era header | "22/22" | 25 |
| header, this week | "24/24 at this commit" | 26 |
| release surface | "24 `verify_*.mjs` probes … 18 + 3 + 1 + 1 + 1 + 1 + 1" | 25 probes, and the list summed to **27** |
| certification dossier | "24 standalone verification probes" | 25 |

Two of those were worse than stale: the release surface's enumeration **did not sum to the total it
claimed beside it**, and the dossier still described the .NET probe as compile-only after it had
begun compiling *and running* 41 fixtures. A wrong number that is merely out of date misleads a
reader who trusts it; a list that contradicts its own total misleads one who checks.

## What is derived, and from what

- **The probe roster** — `tools/verification/verify_*.mjs`, counted. Adding a probe changes it.
- **The gate total** — the number of checks this run recorded, i.e. `checks + 1` at the point the
  check runs. Adding a check changes it.

Both are derived rather than written down, so neither can be updated "in the checker" and left
stale elsewhere. The check asserts it is the **last** `record()` call in its own source
(`recordsAfterThisOne === 1`), because a check appended below it would make its derived total a lie
while the check kept passing. It fired on its own introduction — the header said `26/26` and the run
was `27/27`, which is precisely the behaviour that was missing.

## The three claim sites, and why not all of `docs/`

1. The ledger header — between the `**Current audit state**` marker and the boundary sentence
   `The earlier anchors below are retained`.
2. The release surface's `| Verification |` row.
3. The certification dossier's `Current JS evidence:` line.

The boundary in (1) is load-bearing rather than cosmetic: it is what lets §29–§36 keep stating the
count that was true of the state they describe without those counts being read as current. A count
written *outside* these sites is unchecked, and that is the deliberate trade — inventing a fourth
site changes the check, not the prose.

An enumeration is handled as a second, distinct rule: within such a claim line, the span between
the first and second em dash must contain a bounded list of numbers whose sum equals the roster.
That is what makes "five categories summing to 24 beside a claim of 25" fail even when the headline
number happens to be right.

## Proven

Drift matrix **8/8**, every restore byte-identical by SHA-256:

| Case | Result |
|---|---|
| control — unmutated tree | green (so "it fired" is not read off a check that always fires) |
| ledger header gate total off by one | fired — "claims 26/26 … this run has 27" |
| ledger header roster claim off by one | fired — "claims 24 probes and the roster is 25" |
| release surface enumeration stops summing | fired — "categories sum to 26, the roster is 25" |
| dossier roster claim drifts | fired — "claims 24 probes, the roster is 25" |
| ledger boundary sentence removed | fired — "no longer carries the boundary sentence" |
| **a new probe file is added** | fired — the roster becomes 26 and the documented 25 fails |
| a `record()` appended after the check | fired — "record() calls follow this one; move it back to last" |

The seventh is the one that matters: it mutates no document at all. It proves the check reads the
repository rather than re-checking the number it last saw.

The drift harness was a throwaway (`zzz_throwaway_count_drift.mjs`, deleted on exit). A recursive
member of the gate — "this check can fail" — has no place in the gate itself.

## What was run

| Check | Result |
|---|---|
| `npm run verify:hard-rule-9` | **27/27** |
| `npm run verify:probes` | 25 probes: 24 passed, 1 declared skip, 0 failed |
| `npm run guardian:check` | `CLEAN` |
| `npm run verify:release-claims` | SUCCESS |
| `codegen:release-dossier:check`, `maturity-map:check`, `godot-fallback:check` | current |

## Scope boundary

This makes the *numbers* derived. It does not make the documents derived: a count claim inside a
long prose sentence is still prose, and a claim site that is deleted outright fails the check
(by design) rather than being silently skipped — all seven failure branches are reachable and were
driven. And it says nothing about any number the repository does not claim — a measurement is
evidence about one machine, and no check here makes it more than that.
