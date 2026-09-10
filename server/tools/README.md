# Phase 4 Tool Router

## Execution contract

`routeTool()` is the only public entry point for tool execution. A request must satisfy:

1. Input is a non-array object.
2. Tool name is explicitly present in the caller permission allow-list.
3. `write` tools require `allowWrite: true`.
4. `external` tools require `allowExternal: true`.
5. Tool input validation succeeds.
6. Execution completes before the bounded timeout.
7. The result passes verification.

Unknown tools, invalid input, denied risk, execution errors and timeouts return structured failures and do not throw through the router boundary.

## Built-ins

- `calculator`: read-only restricted arithmetic parser; no dynamic code execution.
- `memory`: Phase 2 memory-service adapter; write risk is explicit.
- `media`: injected media-service adapter; external risk is explicit.

The Phase 2 and Phase 3 implementations remain outside the Tool Router modules. Their integration occurs only through the typed `ToolContext` adapters.
