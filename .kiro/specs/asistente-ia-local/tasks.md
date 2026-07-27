# Implementation Plan: Asistente de IA Local

## Overview

Este plan traduce el diseño técnico (React + Vite + TypeScript, WebLLM, vite-plugin-pwa/Workbox, Dexie.js/IndexedDB, fast-check + Vitest) en pasos de código incrementales. El orden sigue la arquitectura por componentes: primero las funciones puras críticas (con sus 13 property-based tests), luego los componentes con efectos (Service Worker, IndexedDB, WebLLM), y finalmente la Interfaz_Chat en React que los conecta a todos. Cada tarea construye sobre la anterior; no queda código huérfano sin integrar en un paso posterior.

## Tasks

- [x] 1. Configurar el proyecto base y tipos compartidos
  - [x] 1.1 Inicializar el proyecto con Vite + React + TypeScript
    - Configurar `vite-plugin-pwa` como dependencia (sin activar aún la generación completa del Service Worker)
    - Configurar ESLint/TSConfig estricto para el proyecto
    - _Requirements: 10.5_
  - [x] 1.2 Configurar Vitest y fast-check para property-based testing
    - Instalar `vitest`, `fast-check`, `fake-indexeddb`
    - Configurar script de test y convención de nombre `// Feature: asistente-ia-local, Property N: <texto>` para los tests de propiedad
    - _Requirements: 10.5_
  - [x] 1.3 Definir los tipos y modelos de datos compartidos
    - Crear `src/types/models.ts` con `Mensaje`, `RolMensaje`, `Conversacion`, `ArchivoExportado`, `MetadatosModeloCacheado`
    - Implementar `lastActivityAt(conversacion)` como función pura
    - _Requirements: 5.1, 5.3, 5.9, 7.1_

- [x] 2. Implementar Detector_Compatibilidad
  - [x] 2.1 Implementar la función pura `decidir()`
    - Codificar el orden de precedencia (memoria insuficiente → webgpu → wasm → ninguno) y el cálculo de `capacidadesFaltantes`
    - _Requirements: 1.3, 1.4, 1.5, 1.7, 1.8, 10.6_
  - [x] 2.2 Escribir property test para la decisión de motor de inferencia
    - **Property 1: Decisión de motor de inferencia y modo degradado**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.7, 1.8, 10.6**
  - [x] 2.3 Implementar `detectar()` con sondeos reales del entorno
    - Sondear `navigator.gpu`, `WebAssembly` y `navigator.deviceMemory` con timeout de 5s por sondeo
    - _Requirements: 1.1, 1.2, 1.7_
  - [x] 2.4 Escribir pruebas de integración para `detectar()`
    - Mockear `navigator.gpu`, `WebAssembly`, `navigator.deviceMemory` y verificar el comportamiento de timeout
    - _Requirements: 1.1, 1.2_

- [x] 3. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar el Validador de mensajes de entrada
  - [x] 4.1 Implementar la función pura `validarMensaje()`
    - Recorte de espacios en blanco, detección de mensaje vacío y de longitud excedida (4000 caracteres)
    - _Requirements: 4.6, 4.8_
  - [x] 4.2 Escribir property test para la validación de mensajes
    - **Property 6: Validación de mensajes de entrada**
    - **Validates: Requirements 4.6, 4.8**

- [x] 5. Implementar Motor_Inferencia
  - [x] 5.1 Implementar tipos de la máquina de estados y la función pura `reducirGeneracion()`
    - Modelar `EstadoGeneracion`, `EventoGeneracion` y las transiciones `completar`, `cancelar`, `error`
    - _Requirements: 4.3, 4.5, 8.2_
  - [x] 5.2 Escribir property test para las transiciones de generación
    - **Property 5: Transiciones de estado de generación de respuesta**
    - **Validates: Requirements 4.3, 4.5, 8.2**
  - [x] 5.3 Implementar el wrapper `MotorInferencia` sobre `MLCEngine` de WebLLM
    - Implementar `inicializar(motor)`, `generar(historial)` (AsyncIterable de fragmentos) y `cancelar()`
    - Clasificar errores de inicialización como memoria insuficiente (OOM) u otra causa
    - _Requirements: 4.1, 4.2, 4.4, 4.7, 8.1, 8.5_
  - [x] 5.4 Escribir pruebas unitarias del wrapper `MotorInferencia`
    - Simular `MLCEngine` para cubrir inicialización exitosa, fallo por memoria (8.1) y fallo por otra causa (8.5)
    - Verificar que el streaming de fragmentos se propaga incrementalmente (4.2)
    - _Requirements: 4.1, 4.2, 4.7, 8.1, 8.5_

- [x] 6. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implementar Gestor_Descarga_Modelo
  - [x] 7.1 Implementar la función pura `calcularProgreso()`
    - Redondeo y acotamiento al rango [0, 100]
    - _Requirements: 2.2_
  - [x] 7.2 Escribir property test para el cálculo de progreso de descarga
    - **Property 2: Cálculo de progreso de descarga**
    - **Validates: Requirements 2.2**
  - [x] 7.3 Implementar `verificarIntegridad()` mediante checksum sha256
    - Comparación insensible a mayúsculas contra el checksum de referencia
    - _Requirements: 2.4, 2.7_
  - [x] 7.4 Escribir property test para la verificación de integridad
    - **Property 3: Verificación de integridad mediante checksum**
    - **Validates: Requirements 2.4**
  - [x] 7.5 Implementar `asegurarModeloDisponible()`
    - Orquestar descarga con reporte de progreso incremental, detección de estancamiento &gt;30s, verificación de integridad, descarte de datos parciales, reintento único ante archivo corrupto y propagación de error tras el segundo fallo
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 8.3, 8.4_
  - [x] 7.6 Escribir pruebas de integración para la descarga y cacheo del modelo
    - Mockear `fetch` y Cache API; usar temporizadores falsos para el estancamiento de 30s; cubrir descarga interrumpida, redescarga tras corrupción y fallo definitivo
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 8.3, 8.4_

- [x] 8. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implementar Service_Worker_App y ciclo de vida de actualización PWA
  - [x] 9.1 Implementar la función pura `decidirFuenteRespuesta()`
    - Codificar las reglas de resolución online/offline para assets y recursos de modelo
    - _Requirements: 3.4, 3.5, 3.6_
  - [x] 9.2 Escribir property test para la estrategia de resolución de peticiones
    - **Property 4: Estrategia de resolución de peticiones del Service Worker**
    - **Validates: Requirements 3.4, 3.5, 3.6**
  - [x] 9.3 Implementar la función pura `debePurgarCacheModelo()`
    - _Requirements: 9.3_
  - [x] 9.4 Escribir property test para la decisión de purga del Cache_Modelo
    - **Property 13: Decisión de purga de Cache_Modelo por cambio de versión**
    - **Validates: Requirements 9.3**
  - [x] 9.5 Configurar `vite-plugin-pwa`/Workbox y el Manifest_App
    - Configurar precache de assets con estrategia stale-while-revalidate, `manifest.json` (nombre, nombre corto, íconos, color de tema, `display: standalone`), y registro del Service_Worker_App
    - Integrar `decidirFuenteRespuesta()` y el manejo manual (cache-first + verificación de integridad) de la ruta de recursos de modelo
    - _Requirements: 3.1, 3.2, 3.3, 11.1_
  - [x] 9.6 Implementar el ciclo de vida de actualización del Service_Worker_App
    - Detección de nueva versión, `postMessage({type: "SKIP_WAITING"})` diferido hasta que el usuario acepte y hasta que `EstadoGeneracion.tipo !== "generando"`, purga de `Cache_Modelo` usando `debePurgarCacheModelo()` cuando cambia la versión requerida del modelo
    - _Requirements: 3.7, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 9.7 Escribir pruebas de integración del Service Worker y su ciclo de vida
    - Registro exitoso y fallback a red directa ante fallo de registro/cacheo (3.1, 3.2, 3.3)
    - Bloqueo de acceso offline sin cache previo (3.5)
    - Recarga diferida durante generación activa y aplicada al finalizar (9.4, 9.5), descarte de notificación sin interrupción (9.6)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 9.4, 9.5, 9.6_

- [x] 10. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implementar Almacen_Conversaciones y Gestor_Conversaciones
  - [x] 11.1 Definir el esquema Dexie e implementar `AlmacenConversaciones`
    - Implementar `crearConversacion`, `agregarMensaje`, `eliminarConversacion`, `listarConversaciones`, `obtenerConversacion`
    - Envolver cada operación de escritura en `db.transaction('rw', ...)` para atomicidad
    - _Requirements: 5.1, 5.6, 5.7, 5.9_
  - [x] 11.2 Escribir property test de round-trip de persistencia
    - **Property 7: Round-trip de persistencia en el Almacen_Conversaciones**
    - **Validates: Requirements 5.1, 5.5, 5.9**
  - [x] 11.3 Escribir property test de atomicidad ante fallos de almacenamiento
    - **Property 8: Atomicidad ante fallos de almacenamiento**
    - **Validates: Requirements 5.2**
  - [x] 11.4 Implementar `GestorConversaciones`
    - Generación de identificador único al crear, carga y orden descendente por `lastActivityAt`, selección de conversación restante más reciente al eliminar la activa
    - _Requirements: 5.3, 5.6, 5.8_
  - [x] 11.5 Escribir property test de invariantes del Gestor_Conversaciones
    - **Property 9: Invariantes del Gestor_Conversaciones**
    - **Validates: Requirements 5.3, 5.6, 5.7, 5.8**
  - [x] 11.6 Escribir pruebas unitarias de manejo de errores de almacenamiento
    - Verificar que un error de persistencia se informa mediante mensaje y no deja cambios parciales (5.2)
    - _Requirements: 5.2_

- [x] 12. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implementar Exportador_Conversaciones
  - [x] 13.1 Implementar `exportarConversacion()` y `serializarExportacion()`
    - _Requirements: 7.1_
  - [x] 13.2 Implementar `parsearImportacion()` con validación de esquema y generación de nuevo identificador
    - Retornar `ResultadoImportacion` tipado (`ok: false` con `"json_invalido"` o `"esquema_invalido"`) sin lanzar excepciones
    - _Requirements: 7.3, 7.4_
  - [x] 13.3 Escribir property test de round-trip de exportación e importación
    - **Property 11: Round-trip de exportación e importación de conversaciones**
    - **Validates: Requirements 7.1, 7.3, 7.5**
  - [x] 13.4 Escribir property test de rechazo de importación inválida
    - **Property 12: Rechazo de importación inválida sin modificar el almacén**
    - **Validates: Requirements 7.4**
  - [x] 13.5 Implementar el flujo de exportación/importación de archivo desde el navegador
    - Serializar completamente en memoria antes de escribir el archivo (evita archivo parcial ante fallo de escritura), manejo de error de escritura
    - _Requirements: 7.2_
  - [x] 13.6 Escribir pruebas unitarias del manejo de errores de exportación
    - Simular fallo de escritura y verificar que no se genera archivo parcial (7.2)
    - _Requirements: 7.2_

- [x] 14. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Verificar ausencia de transmisión de contenido por red
  - [x] 15.1 Implementar un arnés de pruebas que intercepte `fetch`/`XMLHttpRequest`/`WebSocket`
    - Spy global reutilizable para las pruebas de privacidad
    - _Requirements: 6.1, 6.2_
  - [x] 15.2 Escribir property test de ausencia de transmisión de contenido por red
    - **Property 10: Ausencia de transmisión de contenido por red**
    - **Validates: Requirements 6.1, 6.2**
    - Ejecutar el flujo de envío de mensaje, generación y persistencia con `MotorInferencia` y `AlmacenConversaciones` simulados
  - [x] 15.3 Escribir prueba de auditoría de ausencia de SDKs de telemetría
    - Verificar en el árbol de dependencias/bundle que no se incorporan librerías de analítica o rastreo (6.4)
    - _Requirements: 6.4_

- [x] 16. Implementar la estructura base de la Interfaz_Chat y el wiring de estado
  - [x] 16.1 Implementar el componente raíz `App` y el contexto/hooks de estado global
    - Orquestar `DetectorCompatibilidad`, `MotorInferencia`, `GestorConversaciones` y el estado de `EstadoGeneracion`
    - Activar Modo_Degradado cuando corresponda (1.3, 1.8, 8.1, 8.4, 8.5, 10.6)
    - _Requirements: 1.3, 1.8, 8.1, 8.4, 8.5, 10.6_
  - [x] 16.2 Implementar el componente `Notificacion` centralizado
    - Punto único de presentación de errores de todos los componentes (almacenamiento, descarga, generación, importación/exportación, Service Worker)
    - _Requirements: 5.2, 7.2, 7.4, 8.2, 8.3, 8.4, 8.5_

- [x] 17. Implementar los componentes de conversación y mensajería
  - [x] 17.1 Implementar `ListaConversaciones`
    - Renderizar conversaciones ordenadas por `lastActivityAt`, selección de conversación, estado vacío cuando no hay conversaciones
    - _Requirements: 5.3, 5.4, 5.5, 5.8_
  - [x] 17.2 Implementar `HistorialMensajes`
    - Mostrar mensajes en orden ascendente por timestamp y los fragmentos de respuesta de forma incremental durante la generación
    - _Requirements: 4.2, 5.5_
  - [x] 17.3 Implementar `EntradaMensaje`
    - Validación en vivo con `validarMensaje()`, deshabilitar envío durante generación o inicialización pendiente, botón de cancelar generación, botón de reintento tras error
    - _Requirements: 4.4, 4.6, 4.7, 4.8, 4.9, 8.2_
  - [x] 17.4 Escribir pruebas unitarias de los componentes de conversación y mensajería
    - Envío con motor inicializando (4.7), envío sin conversación activa (4.9), mensaje vacío/excedido (4.6, 4.8), cancelación conservando texto parcial (4.5), reintento tras error (8.2), estado vacío (5.4)
    - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 5.4, 8.2_

- [x] 18. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implementar indicadores, notificaciones de actualización y sección de ayuda
  - [x] 19.1 Implementar el indicador persistente del mecanismo de inferencia activo y el indicador visual de estado offline
    - _Requirements: 1.6, 3.8_
  - [x] 19.2 Implementar la notificación de actualización disponible del Service_Worker_App
    - Visible hasta aceptación/descarte explícito, conectada al `postMessage` diferido de la tarea 9.6
    - _Requirements: 9.1, 9.2, 9.6_
  - [x] 19.3 Implementar la sección de información/ayuda
    - Declaración de privacidad (6.3) y listado de Navegador_Compatible soportados en función de las APIs requeridas (10.4)
    - _Requirements: 6.3, 10.4_
  - [x] 19.4 Implementar el flujo de exportación/importación desde la Interfaz_Chat
    - Conectar `exportarConversacion`/`serializarExportacion`/`parsearImportacion` (tarea 13) con los controles de UI y el `Notificacion`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 19.5 Escribir pruebas unitarias de indicadores, notificación de actualización y ayuda
    - Render del indicador de motor activo (1.6), indicador offline (3.8), notificación persistente de actualización (9.1), texto de privacidad (6.3), lista de navegadores compatibles (10.4)
    - _Requirements: 1.6, 3.8, 6.3, 9.1, 10.4_

- [x] 20. Implementar diseño responsive e instalación PWA
  - [x] 20.1 Implementar el layout responsive de la Interfaz_Chat
    - Adaptación a anchos de celular y escritorio, y reajuste ante cambio de orientación manteniendo visibles la entrada de mensaje y el mensaje más reciente
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 20.2 Escribir pruebas de snapshot/regresión visual del diseño responsive
    - Verificar en distintos viewports simulados que no se requiere desplazamiento horizontal y que la entrada de mensaje permanece visible
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 20.3 Implementar el control de instalación de la PWA
    - Capturar `beforeinstallprompt`, mostrar control visible, invocar el mecanismo de instalación y mostrar el resultado; ocultar el control si el navegador no soporta instalación
    - _Requirements: 11.2, 11.3, 11.6_
  - [x] 20.4 Escribir pruebas de instalabilidad de la PWA
    - Validar el `manifest.json` generado (nombre, íconos, color de tema, `display: standalone`) como smoke test (11.1)
    - Simular captura de `beforeinstallprompt` y control visible (11.2, 11.3), y ausencia de control sin soporte (11.6)
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

- [x] 21. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Integración final y flujo end-to-end
  - [x] 22.1 Conectar el flujo completo de envío de mensaje
    - Validación → creación de conversación si no existe (4.9) → invocación del Motor_Inferencia → streaming incremental hacia `HistorialMensajes` → persistencia del mensaje de usuario y de asistente → transición de `reducirGeneracion` en completar/cancelar/error → reintento explícito tras error (8.2)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.9, 5.1, 8.2_
  - [x] 22.2 Conectar el arranque de la aplicación con Modo_Standalone y ejecución sin conexión
    - Ejecutar la secuencia detección → aseguramiento de modelo → inicialización del Motor_Inferencia descrita en el diagrama de arranque, incluyendo la ejecución en Modo_Standalone (11.4, 11.5) y el bloqueo/aviso de carga inicial sin conexión sin cache previo (3.5)
    - _Requirements: 1.4, 1.5, 1.6, 2.1, 2.5, 3.4, 3.5, 3.6, 11.4, 11.5_
  - [x] 22.3 Escribir pruebas de integración end-to-end del flujo de mensajería y arranque
    - Cubrir el flujo completo con `MotorInferencia` y `AlmacenConversaciones` simulados, y los escenarios de arranque online/offline con y sin cache previo
    - _Requirements: 1.4, 1.5, 1.6, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.5, 4.9, 5.1, 8.2, 11.4, 11.5_

- [x] 23. Checkpoint final - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 24. Configurar despliegue en AWS Amplify Hosting
  - [x] 24.1 Crear el build spec `amplify.yml`
    - Fases `preBuild` (`npm ci`) y `build` (`npm run lint && npm run test && npm run build`), artifacts desde `dist/`, cache de `node_modules` entre builds
    - _Requirements: 12.1, 12.2_
  - [x] 24.2 Documentar las cabeceras de cache requeridas para `index.html` y el Service Worker
    - Coordinar con el Requisito 9 (detección de actualizaciones) para que Amplify no sirva versiones cacheadas obsoletas de esos dos archivos
    - _Requirements: 12.5_

- [x] 25. Seleccionar el tamaño del modelo según la capacidad del dispositivo (evitar OOM en celulares)
  - [x] 25.1 Agregar `MODEL_ID_FULL`/`MODEL_ID_COMPACT` y `modelIdForTier()` en `configuration.ts`
    - `MODEL_ID_COMPACT` (`Llama-3.2-1B-Instruct-q4f16_1-MLC`, ~0.88 GB VRAM) reemplaza a `MODEL_ID_FULL` en dispositivos limitados (en la tarea 29, `MODEL_ID_FULL` termina apuntando al mismo modelo)
    - _Requirements: 1.10_
  - [x] 25.2 Extender `Detector_Compatibilidad` con `nivelModelo`
    - `detect()` agrega el sondeo `isMobileDevice` (User-Agent Client Hints con fallback a User-Agent string); `decide()` agrega la regla pura de `modelTier` ("compacto" si es móvil o `memoryGB < 8`), independiente de la precedencia existente de `selectedEngine`/`missingCapabilities`
    - _Requirements: 1.9_
  - [x] 25.3 Mover `modelId` de la construcción de `InferenceEngine` a `initialize(engine, modelId)`
    - Necesario porque el modelo a cargar depende de `nivelModelo`, resuelto por `decide()` después de que la instancia de `InferenceEngine` ya existe (memoizada en `AppStateProvider`)
    - _Requirements: 1.10_
  - [x] 25.4 Actualizar el marcador de versión de `Service_Worker_App` a un identificador de conjunto de modelos, no de un modelo puntual
    - Evita purgar Cache_Modelo en cada activación para dispositivos en nivel "compacto"
    - _Requirements: 1.10_

- [x] 26. Detectar soporte de `shader-f16` y elegir la variante de cuantización correcta
  - [x] 26.1 Sondear `adapter.features.has("shader-f16")` en `detect()` sobre el mismo adapter de `probeWebgpu()`
    - Sin una segunda llamada a `requestAdapter()`; `shaderF16Available` se agrega a `DecideInput`/`CompatibilityResult` como pass-through puro (no bloqueante: hay variante de modelo sin ese requisito)
    - _Requirements: 1.11_
  - [x] 26.2 Agregar `MODEL_ID_FULL_F32`/`MODEL_ID_COMPACT_F32` y extender `modelIdForTier()` a una matriz 2×2 (tamaño × cuantización)
    - Corrige el bug real reportado: celulares con WebGPU pero sin `shader-f16` (común en drivers Adreno/Mali) recibían `ShaderF16SupportError` de WebLLM antes de descargar ningún peso
    - _Requirements: 1.12_
  - [x] 26.3 Clasificación de red de seguridad para `ShaderF16SupportError`/`FeatureSupportError` en `classifyInitializationError`
    - Nueva causa `unsupported_gpu_feature` con mensaje de Modo_Degradado específico y accionable, por si el sondeo proactivo (26.1) no evita el error
    - _Requirements: 1.12_
    - **Nota post-verificación:** confirmado en producción que esta tarea NO resolvió el bug real
      reportado en Android -- el dispositivo probado sigue mostrando el mensaje genérico
      (`other_cause`), no el de `unsupported_gpu_feature`, así que el error real ahí no es
      `ShaderF16SupportError`. Sigue vigente como mitigación válida para los dispositivos que sí
      tengan ese problema específico; el diagnóstico del caso reportado continúa en la tarea 27.

- [x] 27. Más visibilidad de errores en Android + reducir memoria de generación en iOS
  - Sin forma de depuración remota disponible para confirmar causa raíz; ambos ítems son
    mitigaciones/mejoras de visibilidad best-effort, documentado explícitamente en design.md
  - [x] 27.1 Clasificar `WebGPUNotAvailableError`/`WebGPUNotFoundError` como causa `gpu_unavailable`
    - Distingue una inconsistencia entre la sonda inicial (`probeWebgpu()`) y la negociación WebGPU
      interna de `MLCEngine.reload()` (`detectGPUDevice()`), independiente de nuestra sonda
    - _Requirements: 1.14_
  - [x] 27.2 Reducir `context_window_size` a `CONTEXT_WINDOW_SIZE_COMPACT = 2048` en el nivel compacto
    - Mitigación para el crash observado en iOS/Safari durante la generación (no en el arranque),
      consistente con presión de memoria del KV-cache; iOS no expone señal de memoria desde JS
    - _Requirements: 1.13_

- [x] 28. Mostrar progreso real de carga del modelo en la pantalla de arranque
  - `AppStateProvider` construía el `MotorInferencia` sin cablear su callback de progreso, por lo
    que la pantalla de carga mostraba únicamente una barra indeterminada, sin dato real -- en un
    celular la primera descarga (~1 GB) tarda minutos y era indistinguible de un cuelgue
  - [x] 28.1 `modelLoadProgress.ts`: traducir el `InitializationProgressReport` de WebLLM (4 fases,
    cada una con su propio progreso 0→1 que se reinicia) a un modelo de dominio (`ModelLoadPhase`,
    `parseModelLoadProgress`, `modelLoadPhaseLabel`) con fallback seguro ante texto no reconocido
    - _Requirements: 2.2_
  - [x] 28.2 Cablear el callback en `AppStateProvider` (`createInferenceEngine` ahora recibe
    `onProgress`) y renderizarlo en `ModelLoadProgressIndicator` (barra determinada por fase +
    detalle de transferencia + variante de modelo cargada, vía `modelDescriptorForTier()`)
    - _Requirements: 2.2_

- [x] 29. Un solo modelo (Llama-3.2-1B) para escritorio y móvil, para aliviar memoria en ambos
  - `MODEL_ID_FULL`/`MODEL_ID_FULL_F32` pasan de `Llama-3.2-3B-Instruct` a apuntar al mismo modelo
    que `MODEL_ID_COMPACT`/`MODEL_ID_COMPACT_F32` (`Llama-3.2-1B-Instruct`), -61% VRAM en escritorio
    (de ~2.26 GB a ~0.88 GB). `nivelModelo` deja de decidir el tamaño del modelo, pero se mantiene
    como eje independiente porque sigue decidiendo `context_window_size`
    (`contextWindowSizeForTier()`: 2048 en `compacto`, 4096 en `completo`)
    - _Requirements: 1.10_
  - [x] 29.1 Actualizar `REQUIRED_MODEL_VERSION` en `sw.ts` para purgar los pesos del 3B en
    instalaciones existentes
    - Sin este cambio, quien ya tiene la app instalada conserva los ~2.26 GB del 3B en
      Cache_Modelo indefinidamente y no recibe el alivio de memoria
    - _Requirements: 1.10_
  - [x] 29.2 Actualizar `ModelLoadProgressIndicator`: la etiqueta de tier ("versión completa" /
    "versión compacta") pasa a mostrar la ventana de contexto, el único dato que ahora distingue
    los dos niveles
    - _Requirements: 2.2_

- [x] 30. Diagnóstico visible en el dispositivo + recarga inesperada en móvil/tablet
  - Reportado: una tablet Android/HarmonyOS mostraba "Asistente no disponible" con el mensaje
    genérico (causa real oculta, sólo en `console.error`, inaccesible sin devtools); un celular se
    recargaba solo apenas se enviaba un mensaje, sin ningún `ErrorBoundary`/`location.reload()`
    propio en el código -- la única recarga posible venía de `vite-plugin-pwa`
  - [x] 30.1 `degradedMode.ts`/`App.tsx`: `DegradedModeCause` gana un campo `detail` opcional (la
    descripción cruda del error subyacente, ya logueada, nunca transmitida) mostrado en un bloque
    colapsado "Detalles técnicos" en la pantalla de Modo_Degradado, para poder diagnosticar en
    dispositivos sin devtools accesible
    - _Requirements: 8.1, 8.5_
  - [x] 30.2 `InferenceEngine.ts`: nueva causa `unsupported_gpu_limits`, clasificando los `Error`
    planos que WebLLM tira cuando el driver de la GPU no cumple sus límites mínimos de WebGPU
    (`maxStorageBuffersPerShaderStage`, etc. -- típico en GPUs Mali/Adreno de gama media/baja), antes
    indistinguibles de `other_cause`; mensaje propio y honesto (no sugiere recargar ni revisar
    bloqueadores: es una limitación fija del equipo)
    - _Requirements: 8.5_
  - [x] 30.3 `AppStateProvider.tsx`: corregir el orden del chequeo de conectividad -- antes,
    `!isBrowserOnline()` se evaluaba antes de clasificar el error, así que un dispositivo offline
    reportaba "necesitás conexión" incluso si la causa real era memoria insuficiente o límites de
    GPU; ahora sólo aplica cuando la causa clasificada es `network_error` u `other_cause`
    - _Requirements: 3.5, 8.1, 8.5_
  - [x] 30.4 `registerServiceWorker.ts`: gatear la recarga de página que dispara
    `vite-plugin-pwa`/`workbox-window` al tomar control un SW nuevo. Sin gate, cualquier
    `controllerchange` (otra pestaña acepta la actualización, el navegador recicla un worker viejo)
    recargaba esta pestaña también, sin que su usuario tocara nada -- posible causa de la recarga en
    celular reportada. Ahora sólo recarga si esta pestaña invocó su propio `sendSkipWaiting()`
    - _Requirements: 9.4, 9.5_
  - [x] 30.5 `truncateHistory.ts` + `InferenceEngine.ts`: acotar el historial y el `max_tokens` contra
    la ventana de contexto real (antes se mandaba el historial completo sin límite, un vector de OOM
    real en el nivel `compacto` al crecer la conversación) y escalar `max_tokens` según esa ventana
    (antes fijo en 1024, la mitad entera de la ventana de 2048 del nivel `compacto`)
    - _Requirements: 1.10_
  - [x] 30.6 `sessionDiagnostics.ts`: marcadores best-effort en `sessionStorage` para distinguir, en
    el arranque siguiente, una caída del proceso a mitad de generación de una recarga deliberada
    conocida (la del punto 30.4), informada mediante notificación cuando corresponde
    - _Requirements: 8.1_

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido; el modelo NO debe implementarlas salvo indicación explícita.
- Cada tarea referencia los criterios de aceptación específicos de `requirements.md` para trazabilidad.
- Las 13 properties de `design.md` están cubiertas cada una por exactamente un sub-tarea de property test, ubicada inmediatamente después de la implementación de la función pura correspondiente.
- Los checkpoints garantizan validación incremental antes de avanzar a la siguiente capa del sistema (funciones puras → componentes con efectos → Interfaz_Chat → integración final).
- El diseño responsive (10.1-10.3) y la instalabilidad (11.1, 11.6) se validan con pruebas de componentes/snapshot, no con property-based testing, conforme a la Testing Strategy del diseño.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.2", "1.3"]
    },
    {
      "id": 1,
      "tasks": [
        "2.1", "4.1", "5.1", "7.1", "9.1", "9.3", "11.1", "13.1", "15.1"
      ]
    },
    {
      "id": 2,
      "tasks": [
        "2.2", "2.3", "4.2", "5.2", "7.2", "7.3", "9.2", "9.4",
        "11.2", "11.3", "13.2"
      ]
    },
    {
      "id": 3,
      "tasks": ["2.4", "5.3", "7.4", "9.5", "11.4", "13.3", "13.4"]
    },
    {
      "id": 4,
      "tasks": ["5.4", "7.5", "9.6", "11.5", "11.6", "13.5", "16.2"]
    },
    {
      "id": 5,
      "tasks": ["7.6", "9.7", "13.6", "16.1"]
    },
    {
      "id": 6,
      "tasks": ["17.1", "17.2", "17.3", "19.3", "20.3"]
    },
    {
      "id": 7,
      "tasks": ["15.2", "15.3", "17.4", "19.1", "19.2", "19.4", "20.4"]
    },
    {
      "id": 8,
      "tasks": ["19.5", "20.1"]
    },
    {
      "id": 9,
      "tasks": ["20.2", "22.1"]
    },
    {
      "id": 10,
      "tasks": ["22.2"]
    },
    {
      "id": 11,
      "tasks": ["22.3"]
    }
  ]
}
```
