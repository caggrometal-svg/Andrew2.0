# Andrew 2.0 / IAC33

**Free AI - Independent Personal Assistant with Modular Architecture**

Andrew 2.0 is the foundation for IAC33: a modular personal AI and analysis platform with explicit permissions, persistent state, auditable activity, extensible analysis, configurable autonomy, memory/learning, and research tooling.

## Current IAC33 status

**Integration branch:** `iac33-integration-next`

**Current state:** IAC33 has a working multi-module foundation and is in integration/stabilization. Core contracts, authorization, persistent project state, memory/learning, activity auditing, planning, analysis, network/source policy, dashboard/UI, content generation, and runtime integration tests are present in the branch.

The repository also contains a dated backup branch `backup-iac33-2026-08-30`. It must be treated as a recovery point and not overwritten during stabilization work.

## Verified architecture

`src/` contains the following areas:

- `core/` — shared contracts
- `storage/` — persistence abstractions and stores
- `permissions/` — capability authorization
- `state/` — project state and persistence
- `memory/` — memory storage, retrieval, and learning loop
- `activity/` — auditable activity records
- `planner/` — action planning and sequencing
- `analysis/` — IAC33 analysis, evidence, hypotheses, calibration, probabilistic scoring, and regional seismic forecasting
- `projects/` — project management
- `assistant/` — orchestration/runtime logic
- `ui/` and `app/` — user interface and application integration
- `network/` — source registry and network/satellite policy boundaries
- `integration/` — IAC33 runtime integration tests

## Development stages

### ETAPA 0 — Setup
**Status: complete at repository level; runtime verification remains to be executed in an actual Node environment.**

### ETAPA 1 — Core Types
**Status: implemented.** Shared autonomy, permissions, capabilities, state, activity, planning, and analysis contracts are present.

### ETAPA 2 — Storage
**Status: partially integrated.** Persistent stores exist; consolidation behind a single storage abstraction remains work in progress.

### ETAPA 3 — Permissions
**Status: implemented foundation.** Authorization is explicit and autonomy does not bypass denied permissions.

### ETAPA 4 — State
**Status: implemented foundation.** Project state and persistent project storage are present.

### ETAPA 5 — Memory & Learning
**Status: implemented foundation.** Memory storage/retrieval and a learning loop are present; broader validation and production-quality evaluation remain.

### ETAPA 6 — Activity Audit
**Status: implemented foundation.** Activity records and audit-related modules are present.

### ETAPA 7 — Planner
**Status: active integration.** Planning modules exist; end-to-end execution validation remains.

### ETAPA 8 — Analysis
**Status: active integration.** IAC33 analysis and probabilistic scoring exist. The probabilistic engine is a lightweight weighted scenario-scoring layer; it is not a validated Bayesian model and does not constitute deterministic prediction.

### ETAPA 9 — Projects & Assistant Core
**Status: active integration.** Runtime/orchestration modules exist and require continued integration testing.

### ETAPA 10 — UI
**Status: active integration.** Dashboard and UI work is present.

### ETAPA 11 — Integration & Testing
**Status: in progress.** Runtime integration tests exist. CI verification must still be established or confirmed for the stabilization branch.

### ETAPA 12 — Documentation & Polish
**Status: in progress.** This README has been synchronized with the current integration state; deeper API documentation remains pending.

## Analysis and forecasting

IAC33 can represent signals, weight them, generate multiple scenarios, expose confidence levels, and retain uncertainty warnings. Forecast calibration uses Brier score and mean absolute error. These mechanisms measure and organize uncertainty; they do not prove that earthquake, weather, social, economic, or conflict outcomes can be predicted reliably.

For earthquake analysis in particular, IAC33 must be evaluated against historical datasets and out-of-sample baselines before any operational predictive claim is made.

## Memory and learning

Memory is treated as persistent application state. The learning loop can record learning events and update memory confidence from feedback. Learning must remain auditable and should not silently grant permissions or external capabilities.

## Autonomy and permissions

Autonomy never bypasses denied permissions. A capability requires an explicit `allow` grant before execution. `restricted`, `assisted`, and `autonomous` describe execution behavior; they are not permission bypasses.

## Network capabilities

The repository contains software policy for public web access, source registration, and satellite-control boundaries. These modules do not themselves provide unrestricted Internet, Deep Web, satellite, or external-system access. Actual access requires an implemented connector, credentials where applicable, network availability, and explicit authorization.

## Verification commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

`build` runs TypeScript checking followed by the Vite production build.

## Configuration

```env
VITE_STORAGE_BACKEND=localStorage
VITE_AUTONOMY_LEVEL=restricted
VITE_DEBUG=false
```

## License

Private - Andrew 2.0 / IAC33 Project
