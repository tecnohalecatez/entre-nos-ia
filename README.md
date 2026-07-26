# entre-nos-ia
Hackathon Kiro — Aplicación Web: Usa APIs del navegador (WebGPU/WASM para inferencia local, Service Worker + Cache API para offline) para resolver un problema de la vida cotidiana (chatear con un asistente de IA privado y sin costo), sin depender de servicios externos en tiempo de ejecución.

## Despliegue local

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

## Despliegue en producción (AWS Amplify Hosting)

La aplicación se despliega como sitio estático en **AWS Amplify Hosting**: no hay backend propio,
Amplify solo construye el proyecto y sirve el contenido de `dist/` por HTTPS.

### Qué hace el pipeline

En cada push a la rama configurada, Amplify ejecuta el build spec definido en `amplify.yml`
(raíz del repo):

```bash
npm ci
npm run lint
npm run test
npm run build
```

Si `lint`, `test` o `build` fallan, el despliegue se aborta y la versión previamente publicada
sigue disponible para los usuarios. Los artifacts publicados son el contenido de `dist/`.

### Conectar el repositorio por primera vez

1. Consola de AWS → **Amplify** → **Host a web app**.
2. Conectar el proveedor Git (GitHub/GitLab/Bitbucket/CodeCommit) y autorizar el acceso.
3. Seleccionar este repositorio y la rama a desplegar.
4. Amplify detecta automáticamente `amplify.yml` en la raíz — no hace falta configurar el build
   manualmente en la consola.
5. **Save and deploy**.

### Variables de entorno

No se necesita configurar ninguna. El identificador del modelo (`MODEL_ID`) es una constante de
código (`src/app-state/configuration.ts`), no una credencial, y no hay claves de API ni backend
propio que requiera secretos.

### HTTPS

Amplify Hosting sirve siempre por HTTPS, requisito para que funcionen el Service Worker, WebGPU/WASM
e IndexedDB en el navegador.

### Cache

`amplify.yml` configura `Cache-Control: no-cache` para `index.html` y `sw.js` (así el navegador
siempre revalida y puede detectar una nueva versión), y cache inmutable de un año para
`/assets/**` (los nombres de archivo incluyen un hash del contenido, generado por Vite). El
detalle completo de esta decisión está en la sección "Despliegue" de
[`design.md`](.kiro/specs/asistente-ia-local/design.md).

### Más detalle

Los criterios de aceptación completos de este despliegue están en el Requisito 12 de
[`requirements.md`](.kiro/specs/asistente-ia-local/requirements.md), y el razonamiento de diseño
en la sección "Despliegue" de
[`design.md`](.kiro/specs/asistente-ia-local/design.md).
