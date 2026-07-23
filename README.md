# entre-nos-ia
Hackathon Kiro — Aplicación Web: Usa APIs del navegador (WebGPU/WASM para inferencia local, Service Worker + Cache API para offline) para resolver un problema de la vida cotidiana (chatear con un asistente de IA privado y sin costo), sin depender de servicios externos en tiempo de ejecución.

## Ejecución local

### Requisitos

- Node.js 20.19+ o 22.12+
- Un navegador con WebGPU (Chrome/Edge recientes) o, como alternativa, soporte de WebAssembly

### Instalación

```bash
npm install
```

### Desarrollo

```bash
npm run dev
```

Levanta el servidor de desarrollo de Vite (por defecto en `http://localhost:5173`).

> **Nota:** en modo desarrollo el Service Worker está deshabilitado (`devOptions.enabled: false` en `vite.config.ts`), así que no vas a ver el comportamiento offline/PWA real con `npm run dev`. Para probar eso, usá `npm run build` + `npm run preview`.

### Build de producción y preview

```bash
npm run build
npm run preview
```

`npm run preview` sirve el build generado en `dist/`, incluyendo el Service Worker real (cacheo de assets, funcionamiento offline, instalación como PWA).

### Tests y lint

```bash
npm run test        # corre toda la suite una vez
npm run test:watch  # modo watch
npm run lint         # ESLint
```

### Configuración del modelo

La aplicación usa el modelo `Llama-3.2-3B-Instruct-q4f16_1-MLC`, ya alojado por MLC-AI en Hugging Face dentro del catálogo pre-construido de [WebLLM](https://github.com/mlc-ai/web-llm). No necesitás alojar ni administrar ningún archivo de pesos: al inicializar el motor, WebLLM descarga y cachea los pesos automáticamente en el navegador (Cache API), y los reutiliza desde cache en cargas posteriores.

El identificador del modelo está en `src/app-state/configuration.ts` (`MODEL_ID`). Si querés usar otro modelo, reemplazalo por cualquier `model_id` válido del catálogo de WebLLM (ver [la lista completa](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)), y actualizá `REQUIRED_MODEL_VERSION` en `src/service-worker-app/sw.ts` para que coincida.

La primera carga descarga varios cientos de MB a GB (según el modelo), así que puede tardar unos minutos dependiendo de tu conexión. Requiere una conexión a internet la primera vez; las cargas posteriores usan el cache del navegador y funcionan offline (una vez instalada como PWA).
