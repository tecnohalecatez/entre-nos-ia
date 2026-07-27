# Tech: Entre Nos IA

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | React 18.3.1 (sin router, una sola pantalla) | separa el chat en componentes controlados y testeables sin motor real |
| Lenguaje | TypeScript `~6.0.2`, `strict` | |
| Bundler | Vite `^8.1.1` + `vite-plugin-pwa` (`injectManifest`) | soporte de primera clase para SW y manifest de PWA |
| Estado | React Context + `useReducer` puro (`src/app-state/`) | sin Redux/Zustand — el estado del chat se modela como máquina de estados explícita para permitir PBT |
| Inferencia | `@mlc-ai/web-llm` `0.2.84` (pin exacto) | ver comparación WebLLM vs Transformers.js en `design.md` |
| Persistencia | IndexedDB vía Dexie `4.4.4` | transacciones con rollback automático, exigido por el fallo atómico del Requisito 5.2 |
| Hosting | AWS Amplify Hosting (sitio estático) | cero backend propio — ver [[product]] |

**Dependencias de producción: 4 en total** (`@mlc-ai/web-llm`, `dexie`, `react`, `react-dom`). Sin
librería de markdown, sin UI kit, sin librería de estado. Mantener esta lista corta es intencional:
cada dependencia nueva es superficie que auditar contra el principio de privacidad (ver
`absenceOfTelemetrySdks.test.ts`, que audita el árbol transitivo completo de `package-lock.json`
contra SDKs de analytics/telemetría conocidos).

## Selección de modelo (dos ejes independientes)

No es un 1-de-4: son dos decisiones ortogonales, ambas en `src/app-state/configuration.ts` /
`src/compatibility-detector/decide.ts`.

- **Tamaño** (`modelTier`): `"compact"` (Llama-3.2-1B) si `isMobileDevice` o `memoryGB < 8`;
  si no, `"full"` (Llama-3.2-3B). `navigator.deviceMemory` está cuantizado a potencias de 2 y
  capado en 8, así que 8 es el único valor que confiablemente indica "tope de rango".
- **Cuantización** (`shaderF16Available`): `q4f16_1` si el adapter WebGPU soporta la extensión
  `shader-f16`; si no, fallback a `q4f32_1`. Sin este fallback, WebLLM lanza `ShaderF16SupportError`
  antes de descargar pesos (común en drivers Adreno/Mali de Android).

## Convenciones de testing

Ver `src/testing-conventions.md` para el detalle completo. Resumen:
- Vitest + `happy-dom`, tests co-ubicados junto al código (`*.test.ts(x)`).
- Property-based testing con `fast-check`, mínimo `{ numRuns: 100 }`, comentario obligatorio
  `// Feature: asistente-ia-local, Property N: <texto>` antes de cada `it`.
- Dobles deterministas para efectos: `fake-indexeddb` para Dexie, spies para `fetch`/`XHR`/`WebSocket`
  y para el motor de inferencia.
- `npm run test:coverage` genera cobertura (`@vitest/coverage-v8`); ~94% de statements a la fecha
  de este documento.

## Gate de calidad

`npm run lint && npm run test && npm run build` — el comando de `amplify.yml` (gate de deploy). Si
`lint`, `test` o `build` fallan, el deploy en Amplify se aborta y la versión previa sigue
publicada.

## Trazabilidad spec → código

La mayoría de los archivos en `src/` llevan un comentario al inicio que apunta a la sección de
`design.md` y a los números de requisito de `requirements.md` que implementan. Al tocar un
componente, revisar ese comentario antes de asumir el contrato — es más confiable que inferirlo
del nombre del archivo.
