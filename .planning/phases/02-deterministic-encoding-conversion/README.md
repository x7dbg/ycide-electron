# Phase 2 Runbook: Deterministic Encoding Conversion

This phase converts baseline-targeted libraries to canonical UTF-8 with blocker-first safety rules and strict reconciliation.

## Phase 2 boundary

- no x64 adaptation
- no integration verification
- no promotion to `支持库源码`

## Deterministic execution order

1. Load `.planning/baselines/inventory-baseline.json`.
2. Process unmigrated libraries in baseline order.
3. Process files in each library by sorted relative path.
4. Write reports under `.planning/phases/02-deterministic-encoding-conversion/reports/`.

## Strict gate semantics

- **D-03**: library with any blocked file is `failed` even if some files converted.
- **D-10**: phase passes only when `blocked == 0` and no failed libraries.
- **D-12**: fail immediately if reconciliation math mismatches (`scanned != converted + skipped + blocked` or baseline count mismatch).
- **D-14**: execution can continue to later libraries even when one library fails.

## Commands

```bash
npm run encoding:convert
npm run encoding:check
npm run test:migration:encoding
npm run test:migration && npm run test:migration:encoding
```

## Failure triage

1. Read per-library report in `reports/libraries/*.json`.
2. Review `blockedReasons` and isolate manual remediation candidates.
3. Re-run `npm run encoding:check` after remediation.
4. Keep unresolved blocked files in manual queue; do not force auto-fix.
