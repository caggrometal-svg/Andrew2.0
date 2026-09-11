# Post-release Android bridge hardening

The Phase 16 roadmap is closed. This document records the first post-release engineering increment.

## Objective

Provide a narrow command envelope between Andrew's runtime and the Android layer without exposing arbitrary native execution.

## Controls

- Explicit command allowlist: `open_settings`, `set_runtime_parameter`, `request_status`, `sync_now`.
- Correlation IDs on every command.
- Five-minute command TTL to prevent stale execution.
- Persistent bounded queue with a maximum of 100 commands.
- Explicit acknowledgement records.
- Acknowledgement removes only the matching command.
- Regression coverage for unsupported commands, persistence, correlation, acknowledgements, and queue bounds.

## Boundary

This layer defines and validates the application-level command contract. It does not grant shell access, arbitrary Android intents, or operating-system privileges. Native execution remains a separate, permission-gated integration concern.

## Gate

`npm run test:bridge-hardening` is the focused regression gate. The workflow additionally runs typecheck, build, Phase 14, Phase 13, and the complete test suite.
