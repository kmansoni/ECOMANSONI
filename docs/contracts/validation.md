# Validation Mode

`ValidationMode: Portable`

## Schema-only invariants
- Structure, types, enums, required fields, and `additionalProperties` constraints.

## Gate-only invariants
- `evaluatedAt == metricsRef.generatedAt` (`FP-MIG-901`).
- Weighted active flow sum equals `1.0 +/- tolerance` (`FP-MIG-9102`).
- `nextStage` consistency with `exitCriteria.targetStage` (`FP-MIG-901`).
