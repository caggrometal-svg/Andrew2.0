# Andrew 2.0 native bootstrap release trigger

This commit intentionally triggers the Android release workflow on `iac33-integration-next`.

Purpose:
- produce the next APK containing the current Bridge V3 native sources;
- verify the native bridge compilation and APK packaging gate;
- provide the one-time installation candidate required before any future OTA/live-update layer can be used.

This file contains no secrets and no runtime code.
