#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf '\n== Andrew2.0 / Android verification ==\n'
printf 'Branch: %s\n\n' "$(git branch --show-current 2>/dev/null || printf 'unknown')"

printf '1/4 npm test\n'
npm test -- --run

printf '\n2/4 npm run build\n'
npm run build

printf '\n3/4 npx cap sync android\n'
npx cap sync android

printf '\n4/4 ./gradlew assembleDebug\n'
if [[ ! -x android/gradlew ]]; then
  printf 'ERROR: android/gradlew no existe o no tiene permiso de ejecución. Ejecuta "npx cap add android" en un entorno con Capacitor Android instalado.\n' >&2
  exit 2
fi

cd android
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  printf 'ERROR: Gradle terminó sin generar %s\n' "$APK" >&2
  exit 3
fi

printf '\nAPK generado correctamente: %s\n' "$ROOT_DIR/android/$APK"
printf '== Verificación Android finalizada ==\n'
