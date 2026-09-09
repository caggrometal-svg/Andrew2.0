# Andrew 2.0

**Free AI - Independent Personal Assistant with Modular Architecture**

Andrew 2.0 is a personal AI assistant designed from the ground up with a modular, extensible architecture. It prioritizes autonomy through explicit permissions and configurable capability levels.

## Architecture Overview

Andrew 2.0 is built on the following core principles:

1. **Modularity** - Clear separation of concerns with independent modules
2. **Extensibility** - Designed to incorporate new tools, actions, and capabilities without rewriting core systems
3. **Autonomy as a First-Class Concern** - Autonomy levels are configurable and always respect explicit permissions
4. **No Artificial Limitations** - The system is prepared for advanced features from day one
5. **Persistent State** - All important data survives application restarts
6. **Explicit Permissions** - Every action that modifies data or interacts with external systems requires explicit permission
7. **Complete Auditability** - All activities are logged for debugging, learning, and verification

## Project Structure

```
src/
├── core/                 # Core types and interfaces (ETAPA 1)
├── storage/              # Persistent data abstraction layer (ETAPA 2)
├── permissions/          # Permission system and autonomy levels (ETAPA 3)
├── state/                # State management (ETAPA 4)
├── memory/               # Memory and learning system (ETAPA 5)
├── activity/             # Activity logging and auditability (ETAPA 6)
├── planner/              # Task planning engine (ETAPA 7)
├── analysis/             # Analysis engine (extensible) (ETAPA 8)
├── projects/             # Project management (ETAPA 9)
├── assistant/            # Andrew orchestration core (ETAPA 9)
├── ui/                   # React UI components (ETAPA 10)
└── lib/                  # Utilities and helpers
```

## Development Stages (Etapas)

### ETAPA 0: Setup
- Project initialization
- TypeScript configuration
- Vite build setup
- Directory structure
- **Status**: In progress - awaiting npm install, typecheck, and build verification

### ETAPA 1: Core Types (TODO)
- Type definitions for all core concepts
- Interfaces for extensibility points

### ETAPA 2: Storage Layer (TODO)
- Abstraction for persistent storage
- LocalStorage implementation (IndexedDB/backend later)

### ETAPA 3: Permission System (TODO)
- Permission types and grants
- Autonomy levels (restricted, assisted, autonomous)
- Permission validation logic

### ETAPA 4: State Management (TODO)
- Project state structure
- State updates and reactivity
- Subscriptions for observers

### ETAPA 5: Memory System (TODO)
- Memory item storage
- Search and retrieval
- Categorization and importance tracking

### ETAPA 6: Activity Log (TODO)
- Complete action auditing
- Activity filtering and retrieval
- Temporal queries

### ETAPA 7: Planner (TODO)
- Deterministic task planning
- Permission validation in planning
- Plan execution sequencing

### ETAPA 8: Analysis Engine (TODO)
- Extensible analysis interface
- Basic deterministic analyzer
- Foundation for probabilistic analysis later

### ETAPA 9: Projects & Assistant Core (TODO)
- Project management
- Andrew orchestration logic
- Module integration

### ETAPA 10: React UI (TODO)
- Chat interface
- Project management UI
- Permission management UI
- Activity and memory visualization
- Analysis display

### ETAPA 11: Integration & Testing (TODO)
- End-to-end testing
- Module integration verification

### ETAPA 12: Documentation & Polish (TODO)
- Complete API documentation
- Usage examples
- Architecture deep-dives

## Key Design Decisions

### Autonomy & Permissions
- **Autonomy levels** determine which actions can be executed automatically
- **Permissions** are grants/denials for specific capabilities
- **Critical rule**: Autonomy NEVER bypasses denied permissions
- Autonomy can only accelerate execution when permissions are already granted

### Storage Abstraction
- All persistence goes through a `StorageProvider` interface
- Current implementation: `localStorage`
- Future implementations: `IndexedDB`, backend APIs (no code changes needed)

### Extensibility Points
- **AnalysisEngine**: Swap analysis implementations (deterministic → probabilistic)
- **StorageProvider**: Add new backends without changing business logic
- **Tools & Actions**: Extensible action system prepared for future
- **Autonomy Levels**: Add new levels without rewriting permission system

### No Artificial Constraints
- The architecture is prepared for:
  - Real-time tool execution
  - Network requests
  - File system access
  - External service integration
  - Multi-step autonomous workflows
  - Feedback loops and learning
- Actual capabilities depend on explicit permission grants

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the development server at http://localhost:5173

### Building

```bash
npm run build
```

Produces optimized production build in `dist/`

### Type Checking

```bash
npm run typecheck
```

Runs TypeScript compiler in noEmit mode to verify type safety.

## Configuration

Create a `.env.local` file based on `.env.example`:

```env
VITE_STORAGE_BACKEND=localStorage
VITE_AUTONOMY_LEVEL=restricted
VITE_DEBUG=false
```

## Contributing

All contributions must follow the established architecture:
1. Changes respect the module boundaries
2. No cross-module circular dependencies
3. Interfaces are extended, not overridden
4. All type changes include updates to core/types.ts

## License

Private - Andrew 2.0 Project

## Status

**Current Stage**: ETAPA 0 (Setup in progress)
**Foundation Ready**: Pending verification of npm install, typecheck, and build
**Ready for ETAPA 1**: After successful verification

<!-- Android APK CI trigger: 2026-09-09 -->
