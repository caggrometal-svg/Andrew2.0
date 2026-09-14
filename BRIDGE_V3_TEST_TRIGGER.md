# Bridge V3 test trigger

The Android app can enqueue the Bridge V3 sync worker through `BridgeV3SelfTest.enqueue(context)` for physical verification.

This is a diagnostic trigger only; it does not bypass authentication or fabricate an ACK.
