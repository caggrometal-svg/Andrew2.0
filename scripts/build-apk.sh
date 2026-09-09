#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Andrew2.0 / build:apk =="
echo "[1/6] Tests"
npm run test:run

echo "[2/6] Vite production build"
npm run build

echo "[3/6] Android platform"
if [[ ! -d android ]]; then
  npx cap add android
fi

echo "[4/6] Capacitor sync"
npx cap sync android

echo "[5/6] Gradle assembleDebug"
cd android
./gradlew clean assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -s "$APK" ]]; then
  echo "ERROR: APK was not generated: $APK" >&2
  exit 3
fi

echo "[6/6] APK integrity checks"
command -v apksigner >/dev/null 2>&1 && apksigner verify --verbose "$APK" || true
unzip -t "$APK" >/dev/null

echo "APK generated and validated: $ROOT_DIR/android/$APK"
echo "== build:apk completed =="
