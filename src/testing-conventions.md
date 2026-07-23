# Convenciones de testing — asistente-ia-local

Este proyecto usa **Vitest** (entorno `happy-dom`) como test runner y
**fast-check** para property-based testing (PBT), tal como se especifica en
el diseño (`.kiro/specs/asistente-ia-local/design.md`, sección "Testing
Strategy").

## Pruebas unitarias / de integración

- Archivos `*.test.ts` / `*.test.tsx` co-ubicados junto al código que prueban.
- Cubren casos concretos, de borde, de infraestructura (Service Worker,
  IndexedDB real vía `fake-indexeddb`, Cache API, etc.) y humo (smoke).

## Pruebas de propiedades (PBT)

- Se usa `fast-check` integrado con Vitest.
- Cada test de propiedad se ejecuta con un mínimo de 100 ejecuciones:
  `fc.assert(fc.property(...), { numRuns: 100 })`.
- Cada test de propiedad **debe** llevar un comentario justo antes del
  `it`/`test` con el formato exacto:

  ```ts
  // Feature: asistente-ia-local, Property N: <texto de la propiedad>
  it('...', () => {
    fc.assert(
      fc.property(/* generadores */, (/* args */) => {
        // ...
      }),
      { numRuns: 100 },
    )
  })
  ```

  donde `N` es el número de la property tal como aparece enumerada en
  `design.md` y `<texto de la propiedad>` es su descripción textual.

- Para lógica con efectos (persistencia, descargas, motor de inferencia),
  se usan dobles deterministas: `fake-indexeddb` para IndexedDB/Dexie y
  stubs/spies para `fetch`/`XMLHttpRequest` y el motor de inferencia.

## Comandos

- `npm run test` — ejecuta toda la suite una vez (CI-friendly).
- `npm run test:watch` — modo watch para desarrollo local.
