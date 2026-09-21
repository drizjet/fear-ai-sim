# tools/ci/open_ledger_night_pr.ps1 — put tonight's stability night on a review branch
# and open (or update) the pull request a human merges.
#
# WHY THIS EXISTS. `evidence/probe_stability_ledger.jsonl` is the record that makes an
# intermittency rarer than the repeat count visible, and it only works if nights
# accumulate: one clean night bounds a probe's flake rate at 79%, five at 43%. The nightly
# job appends its night and uploads the ledger, but CI cannot commit, so the night only
# entered the record when a human remembered to download an artifact and run `npm run
# fold:stability-ledger`. That step was therefore done rarely, and a record of one night
# bounds almost nothing. This closes the loop while keeping the judgement with a human:
# the machine prepares the branch and the diff, and a human reviews and merges it.
#
# WHY A PULL REQUEST AND NOT A COMMIT TO THE DEFAULT BRANCH. The ledger is the denominator
# of every rate this repository reports, and the release dossier quotes its numbers — so a
# night entering the record changes published evidence. That is a change someone should
# look at, even when it is machine-written and green.
#
# WHY THE BRANCH IS MACHINE-OWNED AND THE PUSH IS A LEASE. A night is only useful once it
# is merged, so an unmerged night must not be lost: this script folds tonight into the
# *union* of the nights already waiting on the review branch and tonight's. The branch
# therefore accumulates until someone merges it, instead of being rebuilt nightly from the
# default branch. That requires the branch to be rewritten on each run (its base moves
# forward), which is why the push is `--force-with-lease`: it refuses if anyone else has
# pushed to the branch since the fetch, so the one way this could destroy evidence — a
# human editing the branch by hand — becomes a refusal rather than a silent overwrite.
#
# WHY THIS SCRIPT NEVER READS THE LEDGER ITSELF. The record contains non-ASCII characters
# (the engine note has an em dash, and night notes have ellipses), and a shell decodes
# native command output with the console's code page rather than as UTF-8 — so a night
# read here would not equal the same night in the file, and writing it back would put
# mangled bytes into an authority record. Every read and write of the ledger is therefore
# done by `tools/verification/fold_stability_ledger.mjs`, which is handed git refs
# (`--into-ref`, `--require-ref`) and a JSON report comes back. This script handles only
# paths, refs, exit codes and that report. The same applies to the branch's own ledger: it
# is read at the ref by the tool, never checked out into this process.
#
# WHAT IT REFUSES (exit 2, which needs a human and not a retry):
#   - a checkout with other modified tracked files, because a commit must not sweep up
#     unrelated work;
#   - a HEAD that is not the commit the CI run started from, because extra local commits
#     would ride along to the review branch;
#   - a branch that exists remotely but cannot be fetched, because rebuilding it from the
#     default branch would drop the nights already waiting on it;
#   - a fold that would lose a night the default branch holds, that would rewrite a
#     recorded night, or that leaves the release-claim boundary probe failing.
#
# WHAT IT DELIBERATELY DOES NOT DO. It does not re-run the probe suite (tonight's run has
# already happened, and this script's job is to get its evidence reviewed), it does not
# merge anything, and it does not judge whether a night is good news: a night on which a
# probe disagreed with itself is folded and reported like any other, because that is the
# finding the record exists to carry.
#
# Usage:
#   pwsh -File tools/ci/open_ledger_night_pr.ps1                      # DRY RUN (default)
#   pwsh -File tools/ci/open_ledger_night_pr.ps1 -Execute             # fold, push, open/update the PR
#   pwsh -File tools/ci/open_ledger_night_pr.ps1 -Execute -NoPullRequest
# The dry run touches nothing and is the way to see what tonight would add. CI is asserted
# (tools/guardian/hard-rule-9.mjs) to call this with -Execute and nothing else, so the
# document gates below cannot be switched off from the workflow without failing that check.

[CmdletBinding()]
param(
    [switch]$Execute,
    [string]$RepoRoot = '',
    [string]$Branch = 'ci/stability-ledger',
    [string]$Ledger = 'evidence/probe_stability_ledger.jsonl',
    [string]$Dossier = 'docs/RELEASE_CANDIDATE_CERTIFICATION.md',
    [string]$StabilityReport = 'probe_stability_report.json',
    [string]$ComparisonReport = 'probe_stability_comparison.json',
    [string]$Base = '',
    [switch]$NoPullRequest,
    # Rehearses the branch mechanics against a throwaway repository. It skips the document
    # gates, so a run with this flag proves nothing about the documents — CI is asserted
    # not to pass it.
    [switch]$SkipDocumentGates
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$RepoRoot = (Resolve-Path $RepoRoot).Path
$LedgerPath = Join-Path $RepoRoot $Ledger
$DossierPath = Join-Path $RepoRoot $Dossier
$StabilityPath = Join-Path $RepoRoot $StabilityReport
$ComparisonPath = Join-Path $RepoRoot $ComparisonReport
$FoldTool = Join-Path $RepoRoot 'tools/verification/fold_stability_ledger.mjs'
$TempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$Work = Join-Path $TempRoot ("ledger-night-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $Work | Out-Null

function Add-Summary([string]$Text) {
    if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $Text }
}

# `Write-Host` is the idiomatic way to log from a workflow step, but its output is
# rendered by the PowerShell host, and whether that reaches a redirected log is the
# host's decision: while testing this script, the same plain `Write-Host` banner was
# captured in one redirected run and absent from another. So the two messages that must
# never be missing — why a fold was refused, and what it produced — are also written
# straight to the process's own handles, which were captured in every run observed.
# A refusal nobody can read is the difference between "nothing happened" and "a night was
# silently not recorded".
function Write-Critical([string]$Text) { [Console]::Error.WriteLine($Text) }

function Stop-Refused([string]$Message) {
    Write-Host ''
    Write-Host "REFUSED — $Message" -ForegroundColor Red
    Write-Host 'Nothing was pushed. This needs a human, not a retry.'
    Write-Critical "REFUSED — $Message"
    Write-Critical 'Nothing was pushed. This needs a human, not a retry.'
    Add-Summary ''
    Add-Summary '### Stability ledger night — REFUSED'
    Add-Summary ''
    Add-Summary $Message
    Add-Summary ''
    Add-Summary 'Nothing was pushed.'
    exit 2
}

function Stop-Nothing([string]$Message) {
    Write-Host ''
    Write-Host $Message
    [Console]::Out.WriteLine($Message)
    Add-Summary ''
    Add-Summary '### Stability ledger night — nothing to review'
    Add-Summary ''
    Add-Summary $Message
    exit 0
}

# ---------------------------------------------------------------------------
# Git and files, kept to paths, refs and exit codes (see the header note on encoding).
# `Invoke-Git` returns raw text and callers split it with `Get-Lines`; the two are not
# merged into one helper because a non-zero exit is an answer for some calls (is this
# tracked? does this ref exist?) and a failure for others.
# ---------------------------------------------------------------------------

function Invoke-Git {
    param([string[]]$GitArgs)
    $output = (& git -C $RepoRoot @GitArgs 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed (exit $LASTEXITCODE): $($output.Trim())"
    }
    return $output
}

function Test-Git {
    param([string[]]$GitArgs)
    & git -C $RepoRoot @GitArgs > $null 2>&1
    return $LASTEXITCODE
}

function Get-Lines([string]$Text) {
    if ($null -eq $Text) { return @() }
    return @($Text -split "\r?\n" | Where-Object { $_.Trim() -ne '' })
}

function Read-Json([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    return (Get-Content -Raw -Path $Path | ConvertFrom-Json)
}

# A report read from disk may hold a timestamp as text or as a [datetime], depending on the
# PowerShell version's JSON reader. Rendering must not depend on which: a pull request that
# dates a night differently from the ledger reads as a different night.
function As-Iso($Value) {
    if ($Value -is [datetime]) { return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }
    return [string]$Value
}

function Invoke-FoldTool {
    param([string[]]$FoldArgs)
    $reportPath = Join-Path $Work ("fold-" + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.json')
    $all = $FoldArgs + @('--json', $reportPath)
    # The tool's own report is captured and re-emitted rather than piped to the host, so
    # it lands in the log in order and its last line can be quoted in a refusal below.
    $text = (& node $FoldTool @all 2>&1 | Out-String)
    $code = $LASTEXITCODE
    [Console]::Out.Write($text)
    if ($code -ne 0) {
        $lines = Get-Lines $text
        $reason = if ($lines.Count -gt 0) { $lines[$lines.Count - 1] } else { 'no output' }
        Stop-Refused "the fold tool exited $code, so nothing was pushed. Its own last word: $reason"
    }
    if (-not (Test-Path $reportPath)) { Stop-Refused 'the fold tool wrote no report, so nothing about the record can be shown.' }
    return Read-Json $reportPath
}

# ---------------------------------------------------------------------------
# 0. Preconditions.
# ---------------------------------------------------------------------------

if ((Get-Command git -ErrorAction SilentlyContinue) -eq $null) { Stop-Refused 'git is required and was not found on PATH.' }
if ((Test-Git @('rev-parse', '--git-dir')) -ne 0) { Stop-Refused "$RepoRoot is not a git work tree." }
if (-not (Test-Path $LedgerPath)) { Stop-Refused "no ledger at $LedgerPath, so there is nothing to fold." }
if (-not (Test-Path $FoldTool)) { Stop-Refused "the fold tool is missing at $FoldTool." }

$headSha = @(Get-Lines (Invoke-Git @('rev-parse', '--short', 'HEAD')))[0]
$headBranch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>$null)
$ledgerInHead = (Test-Git @('cat-file', '-e', ("HEAD:" + $Ledger))) -eq 0

Write-Host '============================================================'
Write-Host 'NIGHTLY STABILITY LEDGER — PUT TONIGHT ON A REVIEW BRANCH'
Write-Host '============================================================'
Write-Host "  repo:          $RepoRoot"
Write-Host "  HEAD:          $headSha ($headBranch)"
Write-Host "  ledger:        $Ledger$(if (-not $ledgerInHead) { '  (not tracked in HEAD yet)' })"
Write-Host "  review branch: $Branch"
Write-Host "  mode:          $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN (nothing written, nothing pushed)' })"
Write-Host ''

# ---------------------------------------------------------------------------
# 1. Tonight's nights, as the fold tool sees them: the working ledger against the
#    ledger HEAD holds, without writing anything. Asking the tool rather than diffing
#    text is what keeps a non-ASCII night from being mis-read as a different night.
# ---------------------------------------------------------------------------

$previewArgs = @('--from', $LedgerPath, '--into', $LedgerPath)
if ($ledgerInHead) { $previewArgs += @('--into-ref', 'HEAD') }
$preview = Invoke-FoldTool $previewArgs
# When the ledger is not in HEAD at all (its first night, which CI creates), every night it
# holds is new; otherwise the tool's own answer is which nights HEAD does not have.
$pending = if ($ledgerInHead) {
    @($preview.nightsAdded | ForEach-Object { As-Iso $_ })
} else {
    @($preview.nights | ForEach-Object { As-Iso $_.recordedAt })
}

if ($pending.Count -eq 0) {
    Stop-Nothing 'The ledger holds no night that HEAD does not already have, so this checkout has nothing new to review. (If tonight''s probe run failed before it could append, that is why — see the comparison step of this job.)'
}

Write-Host "  tonight:       $($pending.Count) night(s) not in HEAD"
foreach ($night in @($preview.nights | Where-Object { (As-Iso $_.recordedAt) -in $pending })) {
    Write-Host "                 + $(As-Iso $night.recordedAt)  node $($night.node) / $($night.platform), up to $($night.repeat)x"
    if ($night.disagreeing.Count -gt 0) {
        Write-Host "                   DISAGREEMENTS tonight: $($night.disagreeing -join '; ')" -ForegroundColor Yellow
    }
}

$stability = Read-Json $StabilityPath
$comparison = Read-Json $ComparisonPath

# ---------------------------------------------------------------------------
# 2. The pull request body: what the fold adds, what tonight's run did, and the two
#    things a reviewer should not have to take on trust.
# ---------------------------------------------------------------------------

function New-Body($FoldReport, [int]$Unmerged, [bool]$Merged, [bool]$Rehearsal) {
    $requiredIso = @()
    if ($FoldReport.requiredNights) { $requiredIso = @($FoldReport.requiredNights.recordedAt | ForEach-Object { As-Iso $_ }) }
    $nights = @($FoldReport.nights | Where-Object { (As-Iso $_.recordedAt) -notin $requiredIso })

    $body = New-Object System.Collections.Generic.List[string]
    $body.Add('## Nightly stability ledger')
    $body.Add('')
    $body.Add('The probe suite is repeated three times each night (`npm run verify:probe-stability`) so that a probe')
    $body.Add('whose verdict depends on the attempt is visible. `evidence/probe_stability_ledger.jsonl` records')
    $body.Add('those nights and the release dossier quotes them. A CI job cannot commit, so this pull request')
    $body.Add('carries the night(s) instead — merging it is the review.')
    $body.Add('')
    if ($Merged) {
        $body.Add("**Nights this pull request adds: $Unmerged.**")
    } else {
        $body.Add("**Nights this checkout would add: $Unmerged.** (the review branch may already carry nights a reviewer has not merged; those are read at push time and kept)")
    }
    $body.Add('')
    $body.Add('| recorded | node / platform | repeat | probes | probes that disagreed with themselves |')
    $body.Add('|---|---|---|---|---|')
    foreach ($night in $nights) {
        $cell = if (@($night.disagreeing).Count -eq 0) { 'none' } else { $night.disagreeing -join '; ' }
        $body.Add("| $(As-Iso $night.recordedAt) | $($night.node) / $($night.platform) | $($night.repeat)x | $($night.probes) | $cell |")
    }
    $body.Add('')

    if ($stability) {
        $body.Add('### Tonight''s run')
        $body.Add('')
        $body.Add("Up to $($stability.repeat)x per probe, on node $($stability.node) / $($stability.platform). Engine: $($stability.engine)")
        $body.Add('')
        $body.Add("**$($stability.totals.probes) probes: $($stability.totals.passed) passed, $($stability.totals.passedWithSkips) passed with declared skips, $($stability.totals.failed) failed.**")
        if ($stability.totals.failed -gt 0) {
            $body.Add('')
            $body.Add("**This run was RED.** Failing probes: $($stability.failures -join ', ')")
        }
        if ($stability.totals.passedWithSkips -gt 0) {
            $body.Add('')
            $body.Add('Not proven on this runner — a declared skip is not a pass:')
            foreach ($skip in $stability.notProven) { $body.Add("- ``$($skip.name)``: $($skip.reason)") }
        }
        $body.Add('')
    }

    if ($comparison) {
        $body.Add('### What the comparison against the committed recording said')
        $body.Add('')
        if (@($comparison.regressions).Count -eq 0) {
            $body.Add('No verdict regression against the committed recording.')
        } else {
            foreach ($row in $comparison.regressions) { $body.Add("- REGRESSION ``$($row.name)``: $($row.detail)") }
        }
        $body.Add('')
        $body.Add("Ledger after this fold: **$($comparison.ledger.nights) night(s), $($comparison.ledger.attempts) attempt(s)**.")
        if (@($comparison.ledger.everIntermittent).Count -eq 0) {
            $body.Add('No probe has ever disagreed with itself across the recorded ledger.')
        } else {
            foreach ($probe in $comparison.ledger.everIntermittent) {
                $lower = [math]::Round($probe.flakeInterval.lower * 100, 1)
                $upper = [math]::Round($probe.flakeInterval.upper * 100, 1)
                $body.Add("- ``$($probe.name)``: disagreed on $($probe.disagreementNights) of $($probe.nights) night(s); 95% interval $lower%–$upper%.")
            }
        }
        if (@($comparison.ledger.rateGated).Count -gt 0) {
            $body.Add('')
            $body.Add("**The rate gate fires for: $($comparison.ledger.rateGated -join ', ').**")
        }
        if ($comparison.drift.status -eq 'INSUFFICIENT') {
            $body.Add('')
            $body.Add("Timing drift: not yet measurable — $($comparison.drift.nightsWithPerRunDurations) of $($comparison.drift.neededNights) comparable nights carry per-run durations.")
        }
        foreach ($row in $comparison.drift.drifted) {
            $body.Add('')
            $body.Add("- TIMING DRIFT ``$($row.name)``: recent median $($row.recentMedianMs)ms against a baseline of $($row.baselineMedianMs)ms (p90 $($row.baselineP90Ms)ms).")
        }
        foreach ($row in $comparison.timing.slower) { $body.Add("- slower ``$($row.name)``: $($row.currentMs)ms vs $($row.baselineMs)ms") }
        $body.Add('')
    }

    $body.Add('### What was checked before this branch was pushed')
    $body.Add('')
    if ($Merged) {
        $body.Add("- the record now holds **$($FoldReport.ledgerAfter.nights) night(s)**: the fold added $($FoldReport.nightsAdded.Count) to what the branch already had, and preserved $($FoldReport.preservedNights) existing night(s) byte-for-byte")
        $body.Add('- the fold tool verified the bytes it staged before replacing the record: every night already present is still present, and every line parses')
        if ($FoldReport.requiredNights) {
            $body.Add("- every night the default branch holds ($(@($FoldReport.requiredNights.recordedAt).Count)) is present in the folded ledger")
        }
        $body.Add('- the release dossier was regenerated in this same commit, so the document and the record cannot disagree')
        $body.Add('- `node tools/verification/verify_release_claim_boundaries.mjs` exited 0 on the tree that was committed')
        $body.Add('- the commit contains exactly the two files above and no others')
    } else {
        $body.Add('- (dry run — the checks below run only with `-Execute`)')
    }
    if ($Rehearsal) {
        $body.Add('')
        $body.Add('> **Rehearsal:** the dossier was not regenerated and the release-claim probe did not run.')
    }
    $body.Add('')
    $body.Add('### What this does not prove')
    $body.Add('')
    $body.Add('- the numbers are **one machine on one night**: repeatability here is not determinism in general')
    $body.Add('- `--repeat 3` bounds the observation — a defect firing once in ten usually survives three runs')
    $body.Add('- the flake-rate interval is wide until nights accumulate (one clean night bounds a probe at 79%)')
    $body.Add('')
    $body.Add('To reproduce by hand: `npm run fold:stability-ledger -- --from <artifact> [--write]`, then `npm run codegen:release-dossier`.')
    return ($body -join "`n")
}

if (-not $Execute) {
    $bodyPath = Join-Path $Work 'pr-body.md'
    [System.IO.File]::WriteAllText($bodyPath, (New-Body $preview $pending.Count $false $false), ([System.Text.UTF8Encoding]::new($false)))
    Write-Host ''
    Write-Host '  DRY RUN — plan:'
    Write-Host "    - fold tonight's $($pending.Count) night(s) into $Ledger on branch $Branch"
    Write-Host '    - if the branch already carries unmerged nights, keep those too (read at push time)'
    Write-Host "    - regenerate $Dossier, then require verify_release_claim_boundaries.mjs to exit 0"
    Write-Host '    - commit exactly those two files, push with --force-with-lease, open or update the pull request'
    Write-Host ''
    Write-Host "  The pull request body that would be used was written to $bodyPath"
    Write-Host ''
    Write-Host '  Re-run with -Execute to do it.'
    Add-Summary ''
    Add-Summary '### Stability ledger night — dry run'
    Add-Summary ''
    Add-Summary "Tonight adds $($pending.Count) night(s); -Execute would push them as a pull request."
    exit 0
}

# ---------------------------------------------------------------------------
# 3. Execute.
# ---------------------------------------------------------------------------

# 3a. A commit must contain exactly the record and the document that quotes it.
$statusLines = Get-Lines (Invoke-Git @('status', '--porcelain'))
$foreign = @($statusLines | Where-Object { $_ -notmatch '^\?\?' } | ForEach-Object { ($_ -replace '^...', '').Trim().Trim('"') } |
    Where-Object { $_ -ne $Ledger -and $_ -ne $Dossier })
if ($foreign.Count -gt 0) {
    Stop-Refused "this checkout has other modified tracked files, so a fold commit would sweep them up: $($foreign -join ', ')."
}

# 3b. An append-only record cannot have been rewritten on the way here either.
if ($ledgerInHead) {
    $removedLines = @(Get-Lines (Invoke-Git @('diff', 'HEAD', '--', $Ledger)) | Where-Object { $_ -like '-*' -and $_ -notlike '---*' })
    if ($removedLines.Count -gt 0) {
        Stop-Refused "the working ledger removes or alters $($removedLines.Count) line(s) against HEAD. A fold appends; a change that rewrites a recorded night is a human decision."
    }
}

# 3c. In CI the fold must be based on the commit the run started from, so a checkout
#     carrying extra commits cannot smuggle them onto the review branch.
if ($env:GITHUB_SHA) {
    $headFull = @(Get-Lines (Invoke-Git @('rev-parse', 'HEAD')))[0]
    if ($headFull -ne $env:GITHUB_SHA) {
        Stop-Refused "HEAD is $headFull but this run started from $($env:GITHUB_SHA); refusing to base the review branch on a different commit."
    }
}

# 3d. The branch's own nights, so an unmerged night is never lost. They are read at the
#     ref by the fold tool; this only decides whether the ref is there to read.
$branchRef = "refs/remotes/origin/${Branch}"
$fetchOk = (Test-Git @('fetch', '--quiet', 'origin', ("+refs/heads/${Branch}:" + $branchRef))) -eq 0
$branchExists = $fetchOk -and ((Test-Git @('rev-parse', '--verify', '--quiet', $branchRef)) -eq 0)
if (-not $branchExists) {
    $remoteHeads = @(Get-Lines (Invoke-Git @('ls-remote', '--heads', 'origin', ("refs/heads/" + $Branch))))
    if ($remoteHeads.Count -gt 0) {
        Stop-Refused "the review branch $Branch exists on the remote but could not be fetched. Rebuilding it from the default branch would drop the nights already waiting on it, so this stops instead."
    }
    Write-Host "  branch:        $Branch does not exist yet; creating it from $headSha"
} else {
    Write-Host "  branch:        found $Branch; tonight is folded onto the nights it already carries"
}

# 3e. The fold. The union is the tool's job: it reads the branch's ledger at the ref,
#     adds the nights only this checkout has, and verifies every pre-existing line
#     survived before it replaces anything.
$foldArgs = @('--from', $LedgerPath, '--into', $LedgerPath, '--write')
if ($branchExists) { $foldArgs += @('--into-ref', $branchRef) }
if ($ledgerInHead) { $foldArgs += @('--require-ref', 'HEAD') }
$foldReport = Invoke-FoldTool $foldArgs
Write-Host "  folded:        $($foldReport.ledgerBefore.nights) -> $($foldReport.ledgerAfter.nights) night(s), $($foldReport.nightsAdded.Count) added tonight"

$requiredIso = @()
if ($foldReport.requiredNights) { $requiredIso = @($foldReport.requiredNights.recordedAt | ForEach-Object { As-Iso $_ }) }
$unmerged = @($foldReport.nights | Where-Object { (As-Iso $_.recordedAt) -notin $requiredIso })

# 3f. Documents: the record changed, so the document that quotes it must change too, and
#     the boundary probe must still pass on the tree that is about to be committed.
if ($SkipDocumentGates) {
    Write-Warning 'SkipDocumentGates is set: the dossier was NOT regenerated and the release-claim probe did NOT run. This is a rehearsal, not a controlled fold.'
} else {
    & node (Join-Path $RepoRoot 'tools/codegen/generate_release_dossier.mjs') | Out-Host
    if ($LASTEXITCODE -ne 0) { Stop-Refused "regenerating the release dossier exited $LASTEXITCODE, so the commit would leave the document stale." }
    & node (Join-Path $RepoRoot 'tools/verification/verify_release_claim_boundaries.mjs') | Out-Host
    if ($LASTEXITCODE -ne 0) { Stop-Refused "the release-claim boundary probe exited $LASTEXITCODE on the tree this commit would contain; the commit would land red, so it was not made." }
    Write-Host '  gate:          release-claim boundaries PASS on the tree to be committed'
}

# 3g. Commit exactly the record and the dossier.
& git -C $RepoRoot add -- $Ledger $Dossier
if ((Test-Git @('diff', '--cached', '--quiet')) -eq 0) {
    Stop-Nothing 'Nothing to commit: this branch already holds every night in this checkout.'
}

$nightDates = ($unmerged | ForEach-Object { As-Iso $_.recordedAt }) -join ', '
$runSummary = if ($stability) { "The run recorded $($stability.totals.passed) passed / $($stability.totals.passedWithSkips) passed-with-declared-skips / $($stability.totals.failed) failed of $($stability.totals.probes) probes." } else { 'The run summary was not found in this checkout.' }
$messageLines = @(
    "ci(stability): fold $($unmerged.Count) nightly stability-ledger night(s)",
    '',
    "Nights: $nightDates",
    "Recorded by the nightly probe-stability job, up to $(if ($stability) { $stability.repeat } else { 'the recorded' })x per probe.",
    $runSummary,
    '',
    "The ledger now holds $($foldReport.ledgerAfter.nights) night(s) / $($foldReport.ledgerAfter.attempts) attempt(s); $($foldReport.preservedNights)",
    'existing night(s) were preserved byte-for-byte. The release dossier determinism section was regenerated',
    'in this same commit, so the record and the document that quotes it cannot disagree.'
)
$messagePath = Join-Path $Work 'commit-message.txt'
[System.IO.File]::WriteAllText($messagePath, (($messageLines -join "`n") + "`n"), ([System.Text.UTF8Encoding]::new($false)))
& git -C $RepoRoot -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit --quiet -F $messagePath
if ($LASTEXITCODE -ne 0) { Stop-Refused "the commit failed with exit code $LASTEXITCODE." }
$commitSha = @(Get-Lines (Invoke-Git @('rev-parse', '--short', 'HEAD')))[0]

# 3h. Verify the commit really is only the record and the document, then push. The lease
#     is the guard described at the top of this file.
$committed = @(Get-Lines (Invoke-Git @('show', '--name-only', '--format=', 'HEAD')))
$unexpected = @($committed | Where-Object { $_ -ne $Ledger -and $_ -ne $Dossier })
if ($unexpected.Count -gt 0) {
    Stop-Refused "the new commit contains files beyond the record and the dossier ($($unexpected -join ', ')), so it was not pushed."
}
Write-Host "  commit:        $commitSha (${Ledger}, ${Dossier})"

$pushArgs = @('push', '--quiet', 'origin', ("HEAD:refs/heads/" + $Branch))
if ($branchExists) { $pushArgs = @('push', '--quiet', '--force-with-lease', 'origin', ("HEAD:refs/heads/" + $Branch)) }
& git -C $RepoRoot @pushArgs
if ($LASTEXITCODE -ne 0) {
    Stop-Refused "the push to $Branch was refused (exit $LASTEXITCODE). If this was the lease, someone else pushed to the branch: fetch it, review what changed, and run again."
}
Write-Host "  pushed:        $commitSha -> $Branch"

if ($NoPullRequest) {
    Write-Host ''
    Write-Host '  -NoPullRequest: the branch was pushed and no pull request was opened.'
    Add-Summary ''
    Add-Summary '### Stability ledger night — pushed, no pull request'
    Add-Summary ''
    Add-Summary "``$Branch`` was updated at ``$commitSha`` carrying $($unmerged.Count) night(s); no pull request was opened (-NoPullRequest)."
    exit 0
}

# 3i. The pull request a human reviews. It is created once and updated afterwards, so a
#     night that is not merged joins the same review instead of opening a second one.
if ((Get-Command gh -ErrorAction SilentlyContinue) -eq $null) {
    Stop-Refused "the branch was pushed, but gh is not on PATH so no pull request could be opened. Nothing is lost: re-run with gh available, or open the pull request by hand."
}

$bodyPath = Join-Path $Work 'pr-body.md'
[System.IO.File]::WriteAllText($bodyPath, (New-Body $foldReport $unmerged.Count $true $SkipDocumentGates.IsPresent), ([System.Text.UTF8Encoding]::new($false)))
$title = "Nightly stability ledger: $($unmerged.Count) night(s) awaiting review"

$prListOutput = (& gh pr list --head $Branch --state open --json number --jq '.[0].number' 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { Stop-Refused "the branch was pushed, but 'gh pr list' failed (exit $LASTEXITCODE), so the pull request could not be found or opened." }
$prNumber = $prListOutput.Trim()

if ($prNumber) {
    & gh pr edit $prNumber --title $title --body-file $bodyPath | Out-Host
    if ($LASTEXITCODE -ne 0) { Stop-Refused "the branch was pushed, but updating pull request #$prNumber failed (exit $LASTEXITCODE)." }
    Write-Host "  pull request:  #$prNumber updated (already open for $Branch)"
    Add-Summary ''
    Add-Summary "### Stability ledger night — pull request #$prNumber updated"
} else {
    $createArgs = @('pr', 'create', '--head', $Branch, '--title', $title, '--body-file', $bodyPath)
    if ($Base) { $createArgs += @('--base', $Base) }
    $createOutput = (& gh @createArgs 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { Stop-Refused "the branch was pushed, but opening the pull request failed (exit $LASTEXITCODE): $($createOutput.Trim())" }
    $createLines = Get-Lines $createOutput
    $prUrl = $createLines[$createLines.Count - 1]
    Write-Host "  pull request:  $prUrl"
    Add-Summary ''
    Add-Summary "### Stability ledger night — pull request opened: $prUrl"
}

# 3j. A token push does not trigger workflows, so the new or updated pull request would
#     otherwise show no checks at all. Dispatch the same workflow on the branch so the run
#     is visible where a reviewer looks for it. That run cannot fold a night — the fold
#     step requires `schedule` on the default branch — so this cannot feed itself.
& gh workflow run test.yml --ref $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Warning "the branch and pull request are in place, but dispatching CI on $Branch failed (exit $LASTEXITCODE). The pull request will show no checks; the verification above still holds."
    Add-Summary ''
    Add-Summary "> CI could not be dispatched on ``$Branch`` (``gh workflow run`` exited $LASTEXITCODE), so the pull request will show no checks. The verification above still holds."
} else {
    Write-Host "  ci:            test.yml dispatched on $Branch"
}

Write-Host ''
Write-Host "DONE — $($unmerged.Count) night(s) on $Branch at $commitSha, awaiting review."
Write-Critical "DONE — $($unmerged.Count) night(s) on $Branch at $commitSha, awaiting review."
Add-Summary ''
Add-Summary "Folded **$($unmerged.Count) night(s)** onto ``$Branch`` (the record now holds $($foldReport.ledgerAfter.nights) night(s) / $($foldReport.ledgerAfter.attempts) attempt(s)) and regenerated ``$Dossier``. Branch ``$Branch`` at ``$commitSha``."
exit 0
