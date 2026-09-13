# Black-screen fix applied

RuntimeErrorBoundary is wired around the React application so render failures produce a recoverable UI instead of an unusable blank WebView. The existing persisted chat remains the source of truth after recovery.

Physical regression target: send a message, receive backend response, remain on usable chat UI, and retain the response after restart.
