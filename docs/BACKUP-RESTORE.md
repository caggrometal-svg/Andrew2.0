# IAC33 — Respaldo y recuperación

La rama `backup-iac33-2026-08-30` conserva un punto de recuperación del proyecto.

Regla de trabajo: el desarrollo se realiza sobre la rama principal de IAC33 y los hitos estables deben respaldarse mediante una rama con fecha.

Antes de una modificación estructural grande:
1. Crear una rama de respaldo desde el commit estable.
2. Desarrollar en la rama de trabajo.
3. Verificar tipos y build.
4. Mantener el respaldo intacto hasta validar el nuevo estado.

IAC33 debe mantener trazabilidad de cambios y evitar afirmar que una función está terminada hasta haber sido implementada y verificada.
