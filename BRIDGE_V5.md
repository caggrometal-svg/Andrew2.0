# Andrew 2.0 Bridge v5

The Android build contains the GPT/C33 bridge command allowlist and a canonical six-provider contract: OpenAI, OpenRouter, Gemini, Anthropic, DeepSeek and xAI. Runtime inference remains authoritative in Render `andrew2-api`; the APK does not store provider secrets.

Hot-update execution is designed around signed web artifacts, rollback, health checks and acknowledgements. Background synchronization uses Android WorkManager-compatible execution so network work can retry safely under Android power/network constraints.
