# Andrew 2.0

**Free AI - Independent Personal Assistant with Modular Architecture**

Andrew 2.0 is the foundation for IAC33: a modular personal AI and analysis platform with explicit permissions, persistent state, auditable activity, extensible analysis, and configurable autonomy.

## Current IAC33 status

**Active branch:** `iac33-dev`

**Current implementation state:** ETAPA 1 foundation is now implemented, with initial ETAPA 3 authorization and ETAPA 4 project-state primitives added.

The repository also contains IAC33 analysis, dashboard, network-policy, persistent-record, content-generation, source-registry, and module-registry work from the previous development cycle.

### Verified repository structure

The active development branch contains modules for core, storage, permissions, state, memory, activity, planner, analysis, projects, assistant, UI, application/dashboard, and network policy. The `core` directory now contains the shared type contracts used by the newer modules.

## Development stages

### ETAPA 0: Setup
- Project initialization
- TypeScript configuration
- Vite build setup
- Directory structure
- Status: foundation created; runtime verification still needs to be executed in a Node environment.

### ETAPA 1: Core Types
- Shared autonomy, permission, capability, project-state, activity, planning and analysis contracts
- Extensibility interface for analysis engines
- Status: implemented

### ETAPA 2: Storage Layer
- Persistent storage abstraction
- LocalStorage implementation
- Status: existing IAC33 persistent-record work present; abstraction consolidation remains

### ETAPA 3: Permission System
- Explicit capability authorization
- Denials always override autonomy
- No capability is granted without an explicit permission
- Status: authorization primitive implemented

### ETAPA 4: State Management
- Project state structure
- State creation and immutable updates
- Status: foundation implemented

### ETAPA 5–12
Memory, activity, planner, analysis integration, projects/assistant orchestration, UI integration, end-to-end testing, and documentation remain active development targets. Existing IAC33 modules are preserved and will be integrated incrementally.

## IAC33 analysis foundation

The active branch already contains probabilistic analysis, evidence tracking, hypothesis analysis, forecast calibration, regional seismic forecasting, research principles, and IAC33 domain definitions. Probabilistic outputs are explicitly treated as uncertain scenarios rather than deterministic predictions.

## Autonomy and permissions

Autonomy never bypasses denied permissions. A capability must have an explicit `allow` grant before execution. `restricted`, `assisted`, and `autonomous` describe execution behavior; they are not permission bypasses.

## Network capabilities

The repository contains policy modules for public web access, source registration, and satellite-control policy. These modules define software policy boundaries; they do not themselves grant unrestricted Internet, satellite, or external-system access.

## Development commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Configuration

```env
VITE_STORAGE_BACKEND=localStorage
VITE_AUTONOMY_LEVEL=restricted
VITE_DEBUG=false
```

## License

Private - Andrew 2.0 / IAC33 Project
