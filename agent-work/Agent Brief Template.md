# Brief B<NN> — <short slug>

**Assigned to:** <Gemini CLI | OpenCode+DeepSeek | read-only pass>
**Branch / worktree:** agent/B<NN>-<slug>
**Report to:** agent-work/reports/B<NN>-<slug>.md

## Objective
<One paragraph: what outcome this task produces. Plain language.>

## Read first (only these)
- <exact path> — <why>
- <exact path> — <why>
If something you need is not listed, STOP and say so in the report. Do not go exploring the repo.

## In scope — you may change
- <exact file or area>
- <exact file or area>

## Out of scope — do not touch
- <file/area that must not change>
- No new dependencies unless this brief says so.
- No refactors outside the listed files, however tempting.

## Constraints
- <project rules that apply: theme tokens, data-safety rules, patterns to follow, files that are source of truth>
- Match the existing code style of the files you're editing.

## Deliverables
1. <the change itself, committed on the branch above>
2. A report at the path above, using the report template.

## Done criteria
- [ ] <observable outcome 1 — e.g. "project builds with no errors">
- [ ] <observable outcome 2 — e.g. "new unit tests for X pass">
- [ ] <observable outcome 3 — e.g. "feature behaves as described in Objective when run">

## Notes for the builder
- Label every claim in your report: CONFIRMED (you ran/saw it), INFERRED, or NEEDS-DEVICE-TEST.
- If the brief is ambiguous or contradicts the code, stop, change nothing beyond what's unambiguous, and explain in the report. The coordinator decides — you don't guess at scope.
