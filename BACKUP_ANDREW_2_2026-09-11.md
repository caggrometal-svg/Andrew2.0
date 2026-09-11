# Andrew 2.0 — Checkpoint 2026-09-11

## Punto exacto de continuidad
Rama de trabajo: `iac33-integration-next`
Commit de trabajo respaldado: `9d4bbefe8ebe879efc11ae8637a05965dbdda1cf`
Rama de respaldo: `backup/andrew2-current-2026-09-11`

## Estado funcional
- APK Android anterior ya compilada, verificada y publicada como artifact `andrew-debug-apk`.
- Phase 17, Phase 18 y Phase 19 pasan en CI.
- Typecheck y build frontend pasan.
- Conectividad APK → Internet → Render → IA ya está superada; no volver a diagnosticarla salvo error nuevo.
- Backend Render: `andrew2-api`.
- Se usa OpenAI Responses API con parser corregido para `output_text` / `refusal`.

## Trabajo actual — UI/UX
Objetivo: mejorar flujo visual y reducir scroll manual.
- Acceso rápido a Expediente C33 llevado a zona superior/prioritaria.
- Chat móvil ajustado para ocupar mejor la pantalla.
- Mantener auto-scroll cuando el usuario está al final del chat.
- Evitar que respuestas largas desplacen innecesariamente controles importantes.

## Trabajo actual — Sismicidad
Motor: `src/services/seismic/seismicEngine.ts`
Fuente: USGS `all_month.geojson`.
- Mantener análisis estadístico global.
- Añadir/usar segmentación para Chile.
- Mostrar eventos Chile >= M4.0.
- Para cada evento local: magnitud, fecha/hora, hora local Chile, latitud, longitud, profundidad y lugar USGS.
- Mostrar los 12 eventos chilenos más recientes.
- No presentar predicción determinista; es análisis estadístico de actividad sísmica.

## Multimedia
- La generación de video puede detenerse por falta de cuota/créditos del proveedor OpenAI.
- Esto es una limitación externa, no un fallo que deba ocultarse.
- La cola local de multimedia debe conservar trabajos y exponer el error del proveedor.

## Regla permanente del proyecto
Antes de declarar cualquier tarea terminada: barrido completo del módulo/archivo tocado y sus dependencias directas para detectar errores, inconsistencias o código roto.

## Próximo paso
Esperar/confirmar el workflow Android del commit actual. No generar una APK candidata para instalar hasta que el workflow Android termine en PASS y publique `andrew-debug-apk`.

## Criterio de versión
Seguir llamándolo Andrew 2.0 hasta que exista un cambio arquitectónico generacional real. Andrew 3.0 se decidirá cuando el núcleo sea sustancialmente más autónomo/persistente, con memoria profunda, planificación, herramientas/integración Android y sistema modular suficientemente consolidado.

## Nota para el próximo chat
Si el usuario dice `Andrew 2.0`, retomar exactamente desde este checkpoint. No reiniciar diagnósticos ya superados. Revisar primero la rama/commit y el estado del workflow Android si corresponde.
