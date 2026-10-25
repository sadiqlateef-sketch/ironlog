Archived 2026: outdated, see REVIEW.md / NOTES.md.

# IronLog Master Fix & Phase Delegation Playbook

Version: 1.0  
Date: 2026-10-24  
Status: Active  

---

## 1. Overview & Low-Quota Architecture

To address all findings from the release APK audit without burning LLM context windows or rate-limiting credit quotas, all mechanical refactors, native Android receiver bridges, UI layout enhancements, and verification suites are centralized in **`scripts/master-audit-fixes.mjs`**.

### How Quota Is Kept Near Zero:
1. **Zero LLM Churn for File Rewrites:** Rather than having an AI agent re-read and re-emit thousands of lines of React and Java code across multiple round-trips, the master script deterministically applies tested AST and code patches directly.
2. **Phase-by-Phase Execution:** The master agent can run all phases sequentially or delegate individual phases to fresh subagents with compact, targeted briefs.
3. **Automated Verification Gates:** Standardized checks (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`) execute locally via Node child processes with zero external API calls.

---

## 2. Phase Breakdown & Fix Map

| Phase | Category | Files Affected | Description & Value |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Security & Manifest | `android/app/src/main/AndroidManifest.xml` | Removes dead permission `com.ironlog.app.permission.READ_WRITE_DATA`. Registers `RestActionReceiver`. Preserves ecosystem signature permission `com.sadiqlateef.bujotasks.permission.READ_WRITE_DATA`. |
| **Phase 2** | Native Android UI | `RestCountdownPlugin.java`, `RestActionReceiver.java` | Adds interactive action buttons (`+30s`, `-15s`, `Skip Rest`) to the lockscreen and notification shade chronometer. |
| **Phase 3** | UI / Design | `src/components/plate-calculator.tsx` | Upgrades text badge chips into an authentic Olympic Barbell Sleeve visualizer with proportional plate heights, collar stop, and clip. |
| **Phase 4** | Foldable Ergonomics | `src/components/workout/workout-screen.tsx` | Implements responsive 2-column workstation layout for Samsung Galaxy Z Fold8 unfolded inner display (`>= 768px` / `md:`). |
| **Phase 5** | Performance | `next.config.ts` | Configures Web3 tree-shaking stubbing for `@supabase/auth-js` in production static export. |
| **Phase 6** | Documentation Sync | `README.md` | Fixes documentation contradictions regarding Watch pairing location (`More > Watch pairing`) and active feature flags. |
| **Phase 7** | Quality Gates | Test Runner, TypeScript, ESLint, Next.js | Executes regression test suite (218 tests), static typecheck, ESLint, and Next.js static HTML export build. |

---

## 3. Master Agent CLI Commands

### Run Everything End-to-End
```bash
node scripts/master-audit-fixes.mjs --all
```

### Run a Specific Phase
```bash
node scripts/master-audit-fixes.mjs --phase 1  # Manifest cleanup
node scripts/master-audit-fixes.mjs --phase 2  # Native lockscreen actions
node scripts/master-audit-fixes.mjs --phase 3  # Barbell sleeve visualizer
node scripts/master-audit-fixes.mjs --phase 4  # Fold8 dual-pane layout
node scripts/master-audit-fixes.mjs --phase 5  # Performance config
node scripts/master-audit-fixes.mjs --phase 6  # Documentation sync
```

### Run Verification Gates Only
```bash
node scripts/master-audit-fixes.mjs --verify
```

---

## 4. Subagent Delegation Protocol (For AI Agents)

If a Main Agent chooses to delegate a phase to an auxiliary subagent:
1. Provide the subagent **ONLY** the specific phase number and target files.
2. Instruct the subagent to execute `node scripts/master-audit-fixes.mjs --phase <N>`.
3. Verify exit code `0` and diff cleanliness before proceeding to the next phase.
