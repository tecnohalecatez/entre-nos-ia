# Implementation Plan: Asistente de IA Local

## Overview

Este plan traduce el diseño técnico (React + Vite + TypeScript, WebLLM, vite-plugin-pwa/Workbox, Dexie.js/IndexedDB, fast-check + Vitest) en pasos de código incrementales. El orden sigue la arquitectura por componentes: primero las funciones puras críticas (con sus 13 property-based tests), luego los componentes con efectos (Service Worker, IndexedDB, WebLLM), y finalmente la Interfaz_Chat en React que los conecta a todos. Cada tarea construye sobre la anterior; no queda código huérfano sin integrar en un paso posterior.

## Tasks

- [ ] 1. Configurar el proyecto base y tipos compartidos
  - [ ] 1.1 Inicializar el proyecto con Vite + React + TypeScript
    - Configurar `vite-plugin-pwa` como dependencia (sin activar aún la generación completa del Service Worker)
    - Configurar ESLint/TSConfig estricto para el proyecto
    - _Requirements: 10.5_
  - [ ] 1.2 Configurar Vitest y fast-check para property-based testing
    - Instalar `vitest`, `fast-check`, `fake-indexeddb`
    - Configurar script de test y convención de nombre `// Feature: asistente-ia-local, Property N: <texto>` para los tests de propiedad
    - _Requirements: 10.5_
  - [ ] 1.3 Definir los tipos y modelos de datos compartidos
    - Crear `src/types/models.ts` con `Mensaje`, `RolMensaje`, `Conversacion`, `ArchivoExportado`, `MetadatosModeloCacheado`
    - Implementar `lastActivityAt(conversacion)` como función pura
    - _Requirements: 5.1, 5.3, 5.9, 7.1_

- [ ] 2. Implementar Detector_Compatibilidad
  - [ ] 2.1 Implementar la función pura `decidir()`
    - Codificar el orden de precedencia (memoria insuficiente → webgpu → wasm → ninguno) y el cálculo de `capacidadesFaltantes`
    - _Requirements: 1.3, 1.4, 1.5, 1.7, 1.8, 10.6_
  - [ ] 2.2 Escribir property test para la decisión de motor de inferencia
    - **Property 1: Decisión de motor de inferencia y modo degradado**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.7, 1.8, 10.6**
  - [ ] 2.3 Implementar `detectar()` con sondeos reales del entorno
    - Sondear `navigator.gpu`, `WebAssembly` y `navigator.deviceMemory` con timeout de 5s por sondeo
    - _Requirements: 1.1, 1.2, 1.7_
  - [ ] 2.4 Escribir pruebas de integración para `detectar()`
    - Mockear `navigator.gpu`, `WebAssembly`, `navigator.deviceMemory` y verificar el comportamiento de timeout
    - _Requirements: 1.1, 1.2_

- [ ] 3. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implementar el Validador de mensajes de entrada
  - [ ] 4.1 Implementar la función pura `validarMensaje()`
    - Recorte de espacios en blanco, detección de mensaje vacío y de longitud excedida (4000 caracteres)
    - _Requirements: 4.6, 4.8_
  - [ ] 4.2 Escribir property test para la validación de mensajes
    - **Property 6: Validación de mensajes de entrada**
    - **Validates: Requirements 4.6, 4.8**

- [ ] 5. Implementar Motor_Inferencia
  - [ ] 5.1 Implementar tipos de la máquina de estados y la función pura `reducirGeneracion()`
    - Modelar `EstadoGeneracion`, `EventoGeneracion` y las transiciones `completar`, `cancelar`, `error`
    - _Requirements: 4.3, 4.5, 8.2_
  - [ ] 5.2 Escribir property test para las transiciones de generación
    - **Property 5: Transiciones de estado de generación de respuesta**
    - **Validates: Requirements 4.3, 4.5, 8.2**
  - [ ] 5.3 Implementar el wrapper `MotorInferencia` sobre `MLCEngine` de WebLLM
    - Implementar `inicializar(motor)`, `generar(historial)` (AsyncIterable de fragmentos) y `cancelar()`
    - Clasificar errores de inicialización como memoria insuficiente (OOM) u otra causa
    - _Requirements: 4.1, 4.2, 4.4, 4.7, 8.1, 8.5_
  - [ ] 5.4 Escribir pruebas unitarias del wrapper `MotorInferencia`
    - Simular `MLCEngine` para cubrir inicialización exitosa, fallo por memoria (8.1) y fallo por otra causa (8.5)
    - Verificar que el streaming de fragmentos se propaga incrementalmente (4.2)
    - _Requirements: 4.1, 4.2, 4.7, 8.1, 8.5_

- [ ] 6. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implementar Gestor_Descarga_Modelo
  - [ ] 7.1 Implementar la función pura `calcularProgreso()`
    - Redondeo y acotamiento al rango [0, 100]
    - _Requirements: 2.2_
  - [ ] 7.2 Escribir property test para el cálculo de progreso de descarga
    - **Property 2: Cálculo de progreso de descarga**
    - **Validates: Requirements 2.2**
  - [ ] 7.3 Implementar `verificarIntegridad()` mediante checksum sha256
    - Comparación insensible a mayúsculas contra el checksum de referencia
    - _Requirements: 2.4, 2.7_
  - [ ] 7.4 Escribir property test para la verificación de integridad
    - **Property 3: Verificación de integridad mediante checksum**
    - **Validates: Requirements 2.4**
  - [ ] 7.5 Implementar `asegurarModeloDisponible()`
    - Orquestar descarga con reporte de progreso incremental, detección de estancamiento &gt;30s, verificación de integridad, descarte de datos parciales, reintento único ante archivo corrupto y propagación de error tras el segundo fallo
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 8.3, 8.4_
  - [ ] 7.6 Escribir pruebas de integración para la descarga y cacheo del modelo
    - Mockear `fetch` y Cache API; usar temporizadores falsos para el estancamiento de 30s; cubrir descarga interrumpida, redescarga tras corrupción y fallo definitivo
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 8.3, 8.4_

- [ ] 8. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implementar Service_Worker_App y ciclo de vida de actualización PWA
  - [ ] 9.1 Implementar la función pura `decidirFuenteRespuesta()`
    - Codificar las reglas de resolución online/offline para assets y recursos de modelo
    - _Requirements: 3.4, 3.5, 3.6_
  - [ ] 9.2 Escribir property test para la estrategia de resolución de peticiones
    - **Property 4: Estrategia de resolución de peticiones del Service Worker**
    - **Validates: Requirements 3.4, 3.5, 3.6**
  - [ ] 9.3 Implementar la función pura `debePurgarCacheModelo()`
    - _Requirements: 9.3_
  - [ ] 9.4 Escribir property test para la decisión de purga del Cache_Modelo
    - **Property 13: Decisión de purga de Cache_Modelo por cambio de versión**
    - **Validates: Requirements 9.3**
  - [ ] 9.5 Configurar `vite-plugin-pwa`/Workbox y el Manifest_App
    - Configurar precache de assets con estrategia stale-while-revalidate, `manifest.json` (nombre, nombre corto, íconos, color de tema, `display: standalone`), y registro del Service_Worker_App
    - Integrar `decidirFuenteRespuesta()` y el manejo manual (cache-first + verificación de integridad) de la ruta de recursos de modelo
    - _Requirements: 3.1, 3.2, 3.3, 11.1_
  - [ ] 9.6 Implementar el ciclo de vida de actualización del Service_Worker_App
    - Detección de nueva versión, `postMessage({type: "SKIP_WAITING"})` diferido hasta que el usuario acepte y hasta que `EstadoGeneracion.tipo !== "generando"`, purga de `Cache_Modelo` usando `debePurgarCacheModelo()` cuando cambia la versión requerida del modelo
    - _Requirements: 3.7, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ] 9.7 Escribir pruebas de integración del Service Worker y su ciclo de vida
    - Registro exitoso y fallback a red directa ante fallo de registro/cacheo (3.1, 3.2, 3.3)
    - Bloqueo de acceso offline sin cache previo (3.5)
    - Recarga diferida durante generación activa y aplicada al finalizar (9.4, 9.5), descarte de notificación sin interrupción (9.6)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 9.4, 9.5, 9.6_

- [ ] 10. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implementar Almacen_Conversaciones y Gestor_Conversaciones
  - [ ] 11.1 Definir el esquema Dexie e implementar `AlmacenConversaciones`
    - Implementar `crearConversacion`, `agregarMensaje`, `eliminarConversacion`, `listarConversaciones`, `obtenerConversacion`
    - Envolver cada operación de escritura en `db.transaction('rw', ...)` para atomicidad
    - _Requirements: 5.1, 5.6, 5.7, 5.9_
  - [ ] 11.2 Escribir property test de round-trip de persistencia
    - **Property 7: Round-trip de persistencia en el Almacen_Conversaciones**
    - **Validates: Requirements 5.1, 5.5, 5.9**
  - [ ] 11.3 Escribir property test de atomicidad ante fallos de almacenamiento
    - **Property 8: Atomicidad ante fallos de almacenamiento**
    - **Validates: Requirements 5.2**
  - [ ] 11.4 Implementar `GestorConversaciones`
    - Generación de identificador único al crear, carga y orden descendente por `lastActivityAt`, selección de conversación restante más reciente al eliminar la activa
    - _Requirements: 5.3, 5.6, 5.8_
  - [ ] 11.5 Escribir property test de invariantes del Gestor_Conversaciones
    - **Property 9: Invariantes del Gestor_Conversaciones**
    - **Validates: Requirements 5.3, 5.6, 5.7, 5.8**
  - [ ] 11.6 Escribir pruebas unitarias de manejo de errores de almacenamiento
    - Verificar que un error de persistencia se informa mediante mensaje y no deja cambios parciales (5.2)
    - _Requirements: 5.2_

- [ ] 12. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implementar Exportador_Conversaciones
  - [ ] 13.1 Implementar `exportarConversacion()` y `serializarExportacion()`
    - _Requirements: 7.1_
  - [ ] 13.2 Implementar `parsearImportacion()` con validación de esquema y generación de nuevo identificador
    - Retornar `ResultadoImportacion` tipado (`ok: false` con `"json_invalido"` o `"esquema_invalido"`) sin lanzar excepciones
    - _Requirements: 7.3, 7.4_
  - [ ] 13.3 Escribir property test de round-trip de exportación e importación
    - **Property 11: Round-trip de exportación e importación de conversaciones**
    - **Validates: Requirements 7.1, 7.3, 7.5**
  - [ ] 13.4 Escribir property test de rechazo de importación inválida
    - **Property 12: Rechazo de importación inválida sin modificar el almacén**
    - **Validates: Requirements 7.4**
  - [ ] 13.5 Implementar el flujo de exportación/importación de archivo desde el navegador
    - Serializar completamente en memoria antes de escribir el archivo (evita archivo parcial ante fallo de escritura), manejo de error de escritura
    - _Requirements: 7.2_
  - [ ] 13.6 Escribir pruebas unitarias del manejo de errores de exportación
    - Simular fallo de escritura y verificar que no se genera archivo parcial (7.2)
    - _Requirements: 7.2_

- [ ] 14. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Verificar ausencia de transmisión de contenido por red
  - [ ] 15.1 Implementar un arnés de pruebas que intercepte `fetch`/`XMLHttpRequest`/`WebSocket`
    - Spy global reutilizable para las pruebas de privacidad
    - _Requirements: 6.1, 6.2_
  - [ ] 15.2 Escribir property test de ausencia de transmisión de contenido por red
    - **Property 10: Ausencia de transmisión de contenido por red**
    - **Validates: Requirements 6.1, 6.2**
    - Ejecutar el flujo de envío de mensaje, generación y persistencia con `MotorInferencia` y `AlmacenConversaciones` simulados
  - [ ] 15.3 Escribir prueba de auditoría de ausencia de SDKs de telemetría
    - Verificar en el árbol de dependencias/bundle que no se incorporan librerías de analítica o rastreo (6.4)
    - _Requirements: 6.4_

- [ ] 16. Implementar la estructura base de la Interfaz_Chat y el wiring de estado
  - [ ] 16.1 Implementar el componente raíz `App` y el contexto/hooks de estado global
    - Orquestar `DetectorCompatibilidad`, `MotorInferencia`, `GestorConversaciones` y el estado de `EstadoGeneracion`
    - Activar Modo_Degradado cuando corresponda (1.3, 1.8, 8.1, 8.4, 8.5, 10.6)
    - _Requirements: 1.3, 1.8, 8.1, 8.4, 8.5, 10.6_
  - [ ] 16.2 Implementar el componente `Notificacion` centralizado
    - Punto único de presentación de errores de todos los componentes (almacenamiento, descarga, generación, importación/exportación, Service Worker)
    - _Requirements: 5.2, 7.2, 7.4, 8.2, 8.3, 8.4, 8.5_

- [ ] 17. Implementar los componentes de conversación y mensajería
  - [ ] 17.1 Implementar `ListaConversaciones`
    - Renderizar conversaciones ordenadas por `lastActivityAt`, selección de conversación, estado vacío cuando no hay conversaciones
    - _Requirements: 5.3, 5.4, 5.5, 5.8_
  - [ ] 17.2 Implementar `HistorialMensajes`
    - Mostrar mensajes en orden ascendente por timestamp y los fragmentos de respuesta de forma incremental durante la generación
    - _Requirements: 4.2, 5.5_
  - [ ] 17.3 Implementar `EntradaMensaje`
    - Validación en vivo con `validarMensaje()`, deshabilitar envío durante generación o inicialización pendiente, botón de cancelar generación, botón de reintento tras error
    - _Requirements: 4.4, 4.6, 4.7, 4.8, 4.9, 8.2_
  - [ ] 17.4 Escribir pruebas unitarias de los componentes de conversación y mensajería
    - Envío con motor inicializando (4.7), envío sin conversación activa (4.9), mensaje vacío/excedido (4.6, 4.8), cancelación conservando texto parcial (4.5), reintento tras error (8.2), estado vacío (5.4)
    - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 5.4, 8.2_

- [ ] 18. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Implementar indicadores, notificaciones de actualización y sección de ayuda
  - [ ] 19.1 Implementar el indicador persistente del mecanismo de inferencia activo y el indicador visual de estado offline
    - _Requirements: 1.6, 3.8_
  - [ ] 19.2 Implementar la notificación de actualización disponible del Service_Worker_App
    - Visible hasta aceptación/descarte explícito, conectada al `postMessage` diferido de la tarea 9.6
    - _Requirements: 9.1, 9.2, 9.6_
  - [ ] 19.3 Implementar la sección de información/ayuda
    - Declaración de privacidad (6.3) y listado de Navegador_Compatible soportados en función de las APIs requeridas (10.4)
    - _Requirements: 6.3, 10.4_
  - [ ] 19.4 Implementar el flujo de exportación/importación desde la Interfaz_Chat
    - Conectar `exportarConversacion`/`serializarExportacion`/`parsearImportacion` (tarea 13) con los controles de UI y el `Notificacion`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ] 19.5 Escribir pruebas unitarias de indicadores, notificación de actualización y ayuda
    - Render del indicador de motor activo (1.6), indicador offline (3.8), notificación persistente de actualización (9.1), texto de privacidad (6.3), lista de navegadores compatibles (10.4)
    - _Requirements: 1.6, 3.8, 6.3, 9.1, 10.4_

- [ ] 20. Implementar diseño responsive e instalación PWA
  - [ ] 20.1 Implementar el layout responsive de la Interfaz_Chat
    - Adaptación a anchos de celular y escritorio, y reajuste ante cambio de orientación manteniendo visibles la entrada de mensaje y el mensaje más reciente
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ] 20.2 Escribir pruebas de snapshot/regresión visual del diseño responsive
    - Verificar en distintos viewports simulados que no se requiere desplazamiento horizontal y que la entrada de mensaje permanece visible
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ] 20.3 Implementar el control de instalación de la PWA
    - Capturar `beforeinstallprompt`, mostrar control visible, invocar el mecanismo de instalación y mostrar el resultado; ocultar el control si el navegador no soporta instalación
    - _Requirements: 11.2, 11.3, 11.6_
  - [ ] 20.4 Escribir pruebas de instalabilidad de la PWA
    - Validar el `manifest.json` generado (nombre, íconos, color de tema, `display: standalone`) como smoke test (11.1)
    - Simular captura de `beforeinstallprompt` y control visible (11.2, 11.3), y ausencia de control sin soporte (11.6)
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

- [ ] 21. Checkpoint - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Integración final y flujo end-to-end
  - [ ] 22.1 Conectar el flujo completo de envío de mensaje
    - Validación → creación de conversación si no existe (4.9) → invocación del Motor_Inferencia → streaming incremental hacia `HistorialMensajes` → persistencia del mensaje de usuario y de asistente → transición de `reducirGeneracion` en completar/cancelar/error → reintento explícito tras error (8.2)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.9, 5.1, 8.2_
  - [ ] 22.2 Conectar el arranque de la aplicación con Modo_Standalone y ejecución sin conexión
    - Ejecutar la secuencia detección → aseguramiento de modelo → inicialización del Motor_Inferencia descrita en el diagrama de arranque, incluyendo la ejecución en Modo_Standalone (11.4, 11.5) y el bloqueo/aviso de carga inicial sin conexión sin cache previo (3.5)
    - _Requirements: 1.4, 1.5, 1.6, 2.1, 2.5, 3.4, 3.5, 3.6, 11.4, 11.5_
  - [ ] 22.3 Escribir pruebas de integración end-to-end del flujo de mensajería y arranque
    - Cubrir el flujo completo con `MotorInferencia` y `AlmacenConversaciones` simulados, y los escenarios de arranque online/offline con y sin cache previo
    - _Requirements: 1.4, 1.5, 1.6, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.5, 4.9, 5.1, 8.2, 11.4, 11.5_

- [ ] 23. Checkpoint final - Asegurar que todos los tests pasen
  - Ensure all tests pass, ask the user if questions arise.

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
