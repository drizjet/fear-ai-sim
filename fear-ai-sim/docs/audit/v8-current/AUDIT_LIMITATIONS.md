# V8 audit — limitations (candidate 79f287c)

1. Auditor independence is bounded: the five auditors are same-model
   scout subagents in the builder's session, not independent labs. They
   read the audit clone (never the builder worktree) and treated handoff
   claims as untrusted, but shared-model blind spots are possible. The
   manager independently re-verified the three P0s, MAT-001, TM-HOLD-08,
   and A5-F2 by direct read/grep; all other findings rest on auditor
   reads with file:line citations, not on re-execution.
2. Static reads dominate: auditors 2-5 ran no jest suites (by brief
   preference); dynamic behavior claims (attractors, lock-ins, drift)
   are code-reading conclusions, not measured trajectories.
3. Single machine, Windows-only, Node 24.19. No cross-platform,
   no second-machine reproduction.
4. No soak runs beyond the existing suites (5000 ticks max, ~25s).
5. Rust lane, Tauri/Electron shells, visual frontend, Two Roads
   benchmark world: out of scope unless cited.
6. Ledger history before 2026-09-03 accepted as committed context;
   only candidate-state admissibility was re-derived, not the full
   historical mutation-kill testimony (see TM-BIAS-07).
7. Audit artifacts were written to the worktree AFTER all candidate
   gates ran; candidate SHA 79f287c excludes them (untracked at freeze).
   A future candidate including these files needs no re-proof of
   unrelated gates, but its own lint run (new files are unfingerprinted
   unless seeded).
