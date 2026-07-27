# Structure: Entre Nos IA

## Organización de `src/`

Un directorio por componente de dominio (nombrado según el vocabulario de
`.kiro/specs/asistente-ia-local/requirements.md`, no por capa técnica). Dentro de cada uno:
componente(s), su `.css` si aplica, y sus tests, todos co-ubicados — no hay `components/`,
`styles/` ni `__tests__/` separados del código que prueban.

```
src/
├── app-state/               Context + reducer raíz, boot (AppStateProvider), configuración de modelo
├── chat-interface/           UI del chat: ChatInterface, ConversationList, MessageHistory,
│                              MessageInput, Markdown (renderer propio), indicadores de header
├── compatibility-detector/   detect() (I/O: WebGPU/WASM/memoria) + decide() (función pura)
├── conversation-exporter/    export/import de conversación a JSON versionado
├── conversation-manager/     ConversationManager (orquesta CRUD de conversaciones)
├── conversation-store/       ConversationStore — IndexedDB vía Dexie
├── inference-engine/         InferenceEngine — wrapper propio sobre MLCEngine (WebLLM)
├── message-validator/        validateMessage (1-4000 caracteres, trim)
├── model-download-manager/   Gestor de descarga con checksum — ver nota de estado en design.md
├── notification/, pwa-install/, theme/   providers de UI transversales
├── service-worker-app/       sw.ts (Workbox vía vite-plugin-pwa) + lógica de versión de cache
├── testing/                  utilidades compartidas de test (networkSpy, stubs)
└── types/                    tipos compartidos de dominio
```

## Convenciones

- **CSS**: un archivo `.css` por componente, co-ubicado, sin CSS-in-JS ni CSS modules. Design
  tokens globales en `src/index.css` (`:root`), dark mode vía `:root[data-theme="dark"]`.
- **Sin barrel files** (`index.ts` re-exportando todo un directorio) — importar directo del
  archivo fuente.
- **Funciones puras separadas de I/O**: el patrón `detect()`/`decide()` en
  `compatibility-detector/` se repite en el resto del código (p. ej. `reduceGeneration.ts`,
  `calcularProgreso`, `decidirFuenteRespuesta` en `design.md`) — es lo que hace posible el
  property-based testing. Al agregar lógica nueva con ramas de decisión, preferir extraer la
  decisión a una función pura antes que mezclarla con el efecto.
- **Trazabilidad obligatoria**: todo componente nuevo que implemente un requisito del spec debe
  llevar el comentario de referencia a `design.md`/`requirements.md` al inicio del archivo (ver
  [[tech]], sección "Trazabilidad spec → código").
- **`.kiro/specs/asistente-ia-local/`** es la fuente de verdad del producto y el diseño; no
  duplicar su contenido en comentarios de código más allá de la referencia cruzada.
