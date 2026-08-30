# IAC33 V2 — Cierre técnico

## Estado

IAC33 V2 reúne el núcleo de estado por proyecto, memoria de aprendizaje, evaluación probabilística, predicciones persistentes, resolución de resultados y trazabilidad de evidencia.

## Flujo funcional

1. Registrar evidencia observada y su fuente.
2. Evaluar señales e hipótesis.
3. Generar una predicción probabilística con incertidumbre.
4. Registrar el resultado real cuando esté disponible.
5. Calcular Brier Score.
6. Convertir el resultado en memoria de aprendizaje.
7. Ponderar el aprendizaje por desempeño histórico.
8. Usar el aprendizaje en la siguiente evaluación/predicción.

## Aislamiento

El aprendizaje está separado por proyecto y dominio. El estado, permisos, actividad, predicciones y memoria pertenecen al proyecto correspondiente.

## Integridad

Las operaciones de memoria validan identidad, proyecto, dominio y coherencia del Brier Score. Las predicciones se mantienen separadas de la evidencia observada.

## Verificación

La suite incluye pruebas funcionales y E2E para predicciones correctas e incorrectas, persistencia, aislamiento, permisos, actividad y ciclo de retroalimentación.

La certificación final requiere una ejecución CI sobre el HEAD actual con:

- Setup Node
- npm install
- Typecheck
- Vitest
- Build

No se considera el proyecto certificado hasta que esas etapas tengan resultado exitoso en CI.
