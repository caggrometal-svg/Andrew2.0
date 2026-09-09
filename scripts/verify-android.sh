#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf '\n== Andrew2.0 / Android verification ==\n'
printf 'Branch: %s\n\n' "$(git branch --show-current 2>/dev/null || printf 'unknown')"

printf '1/5 npm test\n'
npm test -- --run

printf '\n2/5 npm run build\n'
npm run build

printf '\n3/5 npx cap sync android\n'
npx cap sync android

printf '\n4/5 ./gradlew clean assembleDebug\n'
if [[ ! -x android/gradlew ]]; then
  printf 'ERROR: android/gradlew no existe o no tiene permiso de ejecución. Ejecuta "npx cap add android" en un entorno con Capacitor Android instalado.\n' >&2
  exit 2
fi

cd android
./gradlew clean
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -s "$APK" ]]; then
  printf 'ERROR: Gradle terminó sin generar %s\n' "$APK" >&2
  exit 3
fi

printf '\n5/5 APK integrity/signature verification\n'
if command -v apksigner >/dev/null 2>&1; then
  apksigner verify --verbose --print-certs "$APK"
fi
unzip -t "$APK" >/dev/null
printf '\nAPK generado y validado: %s\n' "$ROOT_DIR/android/$APK"
printf '== Verificación Android finalizada ==\n'
