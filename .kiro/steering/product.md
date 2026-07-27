# Product: Entre Nos IA

## Qué es

Una PWA de chat con un asistente de IA (Llama-3.2-Instruct) que corre **completo dentro del
navegador** del usuario — inferencia vía WebGPU/WASM (WebLLM), sin backend propio y sin llamadas a
APIs de inferencia de terceros en tiempo de ejecución.

El nombre es un juego de palabras: "entre nos" = "esto queda entre nosotros". Es la tesis del
producto, no solo el naming.

## Para quién

Hispanohablantes (español rioplatense) que quieren conversar con un asistente de IA sin que el
contenido de esas conversaciones salga de su dispositivo, y sin pagar por token ni depender de una
cuenta en un servicio de terceros.

## Principios de producto (no negociables)

1. **Privacidad por construcción, no por promesa**: ninguna ruta de código hace `fetch`/`XHR`/
   `WebSocket` con contenido de un `Mensaje`. Esto es verificable, no solo declarado — ver
   `src/testing/networkSpy.ts` y `absenceOfNetworkTransmission.property.test.ts`.
2. **Cero costo de operación**: no hay backend propio que mantener ni API de pago detrás. AWS
   Amplify Hosting solo sirve `dist/` estático (ver [[tech]]).
3. **Funciona offline** tras la primera carga (Service Worker + Cache API para assets y pesos del
   modelo).
4. **Responde siempre en español**, sin excepción — impuesto por `SYSTEM_PROMPT`
   (`src/inference-engine/systemPrompt.ts`), porque el modelo base deriva al inglés en inputs
   cortos.
5. **Degradación explícita, no silenciosa**: si el dispositivo no tiene WebGPU/WASM suficiente o
   memoria suficiente, se muestra Modo_Degradado con el motivo exacto, nunca un chat roto.

## Fuente de verdad del producto

`.kiro/specs/asistente-ia-local/requirements.md` (12 requisitos en formato EARS) es la
especificación completa y autoritativa. Este archivo es un resumen para orientarse rápido, no un
reemplazo.
