#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Andrew2.0 / build:apk =="

echo "[1/5] Tests"
npm test -- --run

echo "[2/5] Vite production build"
npm run build

echo "[3/5] Android platform"
if [[ ! -d android ]]; then
  npx cap add android
fi

echo "[4/5] Capacitor sync"
npx cap sync android

echo "[5/5] Gradle assembleDebug"
cd android
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "ERROR: APK was not generated: $APK" >&2
  exit 3
fi

echo "APK generated: $ROOT_DIR/android/$APK"
echo "== build:apk completed =="
