# C33 Control Plane V1

The control plane is the authenticated channel from Andrew to the Android Bridge V3.

## Flow

Andrew message -> authenticated control endpoint -> validated command -> PostgreSQL queue -> Android Bridge V3 -> ACK/result.

## Allowed commands

- `open_settings`
- `set_runtime_parameter`
- `request_status`
- `sync_now`

Runtime writes remain disabled unless `BRIDGE_V3_ALLOW_WRITE` (or the legacy equivalent) is explicitly enabled on the server.

The control token is server-side only and is never bundled into the Android application.
