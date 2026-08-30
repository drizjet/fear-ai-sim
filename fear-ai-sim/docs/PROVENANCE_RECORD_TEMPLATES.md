# Provenance Record Templates

Use these templates for future work. IDs must be stable and unique.

## Source record

```yaml
source_id:
source_type: USER_CHAT | ASSISTANT_CHAT | ATTACHMENT | PROJECT_DOCUMENT | SOURCE_CODE | TEST_OUTPUT | RUNTIME_RUN | BUILD_ARTIFACT | RESEARCH_PAPER | RESEARCH_REPOSITORY | KNOWLEDGE_LEDGER | AUDIT_REPORT
title_or_path:
author_or_speaker:
date_if_known:
access_status: ACCESSIBLE | PARTIAL | INACCESSIBLE
coverage_status: COMPLETE | MOSTLY_COMPLETE | PARTIAL | NOT_REVIEWED
location_or_message_reference:
content_hash_if_file:
notes:
```

## Atomic claim

```yaml
claim_id:
canonical_claim:
exact_source_text:
origin_type: USER | ASSISTANT | ATTACHMENT | PROJECT_DOCUMENT | CODE_AUDIT | WEB_RESEARCH | TOOL_OUTPUT | INFERENCE
evidence_status: CODE_VERIFIED | TEST_VERIFIED | RUNTIME_VERIFIED | SOURCE_SUPPORTED | DOCUMENTED_CLAIM | UNKNOWN | CONTRADICTED | STALE
implementation_status: IMPLEMENTED_AND_VERIFIED | IMPLEMENTED_CLAIMED | PARTIALLY_IMPLEMENTED | WIRED_BUT_BROKEN | IMPLEMENTED_BUT_DEAD_CODE | TEST_ONLY | PROTOTYPE_ONLY | DESIGNED_NOT_IMPLEMENTED | RESEARCH_ONLY | UNKNOWN | NOT_APPLICABLE
source_id:
verification_method:
related_claim_ids: []
contradicts_claim_ids: []
supersedes_claim_ids: []
affected_parts: []
open_question:
next_action:
notes:
```

## Implementation evidence

```yaml
evidence_id:
feature_or_claim:
repository:
commit_or_version:
file:
symbol_or_line_range:
entry_point_or_caller:
observation:
evidence_status: CODE_VERIFIED | TEST_VERIFIED | RUNTIME_VERIFIED
command_or_test:
result:
limitations:
related_claim_ids: []
recorded_at:
```

## Design proposal

```yaml
proposal_id:
problem:
proposed_behavior:
inputs:
outputs:
assumptions:
alternatives: []
risks: []
dependencies: []
research_inspiration: []
affected_parts: []
implementation_status: PROPOSED
validation_plan:
revisit_condition:
related_claim_ids: []
recorded_at:
```

## Worklog entry

```yaml
worklog_id:
date:
operator:
objective:
parts_touched: []
sources_reviewed: []
files_inspected: []
files_changed: []
commands_run: []
tests_run: []
results:
new_evidence_ids: []
new_proposal_ids: []
decisions_updated: []
unknowns_remaining: []
next_action:
```

## Cross-part interface

```yaml
interface_id:
from_part:
to_part:
contract_name:
purpose:
producer:
consumer:
input_schema:
output_schema:
source_type_requirements: []
allowed_statuses: []
failure_behavior:
determinism_requirements:
versioning_policy:
tests_required: []
open_questions: []
```
