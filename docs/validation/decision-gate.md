# Validation Decision Gate

Use the interview scorecards and completed release workflow diaries as the
source of truth. Count only qualified, completed interviews and explicit
responses. Do not infer demand from incomplete records or opinions without an
example.

## Measures

```text
top_three_rate = interviews_where_top_three / completed_interviews
alpha_rate = alpha_commitments / completed_interviews
median_manual_hours = median(hours_planning + hours_reporting)
```

Record the numerator and denominator for each rate, and list the interview IDs
included in every count.

## Gate rules

```text
PROCEED when completed_interviews >= 15 AND top_three_count >= 5 AND alpha_commitments >= 3.
NARROW when demand exists but the requested workflow is consistently smaller than the design.
STOP when top_three_count < 5 OR alpha_commitments < 3 after 15 qualified interviews.
```

The `NARROW` outcome requires a written description of the smaller workflow,
the evidence supporting it, and the capabilities to remove or defer.

## Gate record

| Field | Value |
| --- | --- |
| Decision date | |
| Decision owner | |
| Completed qualified interviews | |
| Completed release diaries | |
| Top-three count / rate | |
| Alpha commitments / rate | |
| Median manual hours | |
| Decision (`PROCEED`, `NARROW`, or `STOP`) | |
| Evidence references | |

## Decision rationale

Summarize the observed workflow, demand evidence, and the exact records behind
the decision. Include the interview IDs and diary references used for every
count. Keep product opinions and unsupported assumptions out of the rationale.

| Observation | Evidence reference | Implication |
| --- | --- | --- |
| | | |
| | | |
| | | |
