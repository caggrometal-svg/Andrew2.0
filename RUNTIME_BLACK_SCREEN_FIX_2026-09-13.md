# Runtime black-screen fix

Observed on physical Android device: sending a chat message reaches the backend and the response is persisted, but the app UI becomes black and requires an app restart. On restart, the assistant response is present in chat.

Required fix target: make the chat send/response lifecycle resilient so a rendering/state exception cannot leave the WebView unusable; preserve persisted messages and recover UI state after async response completion.

Regression requirement: verify send -> backend -> response -> persistence -> UI update without black screen. Do not modify protected timeline-store.ts.
