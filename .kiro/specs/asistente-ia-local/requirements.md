# Requirements Document

## Introduction

Esta funcionalidad implementa un asistente de inteligencia artificial conversacional que se ejecuta completamente en el navegador del usuario, sin depender de servicios externos en tiempo de ejecución. La aplicación utiliza APIs nativas del navegador (WebGPU y WebAssembly) para realizar inferencia local de un modelo de lenguaje, y Service Worker junto con Cache API para permitir el funcionamiento sin conexión, incluyendo el cacheo de los assets de la aplicación y de los pesos del modelo. El objetivo es ofrecer a los usuarios un asistente de IA privado (los datos nunca salen del dispositivo) y sin costo de operación (no se realizan llamadas a APIs de pago), resolviendo la necesidad cotidiana de contar con un asistente conversacional accesible, privado y gratuito.

## Glossary

- **Sistema**: La aplicación web de asistente de IA local en su conjunto.
- **Motor_Inferencia**: Componente responsable de cargar el modelo de lenguaje y generar respuestas de texto localmente, usando WebGPU cuando está disponible o WASM como alternativa.
- **Detector_Compatibilidad**: Componente que determina qué capacidades de hardware y navegador están disponibles (WebGPU, WASM, memoria disponible) antes de inicializar el Motor_Inferencia.
- **Gestor_Descarga_Modelo**: Componente responsable de descargar los archivos de pesos del modelo y reportar el progreso de descarga.
- **Service_Worker_App**: El Service Worker registrado por el Sistema que intercepta peticiones de red y gestiona el cacheo de assets estáticos y archivos de modelo.
- **Cache_Assets**: El almacén de Cache API que contiene los archivos estáticos de la aplicación (HTML, CSS, JS).
- **Cache_Modelo**: El almacén de Cache API que contiene los archivos de pesos del modelo de lenguaje descargados.
- **Interfaz_Chat**: El componente de interfaz de usuario donde el usuario escribe mensajes y visualiza las respuestas del asistente.
- **Almacen_Conversaciones**: El almacén local basado en IndexedDB donde se persisten las conversaciones y sus mensajes.
- **Gestor_Conversaciones**: Componente responsable de crear, listar, seleccionar y eliminar conversaciones almacenadas en el Almacen_Conversaciones.
- **Exportador_Conversaciones**: Componente responsable de exportar una conversación a un archivo JSON y de importar un archivo JSON previamente exportado.
- **Conversacion**: Conjunto ordenado de mensajes intercambiados entre el usuario y el asistente, identificado de forma única.
- **Mensaje**: Unidad de texto enviada por el usuario o generada por el Motor_Inferencia dentro de una Conversacion, con un rol (usuario o asistente) y una marca de tiempo.
- **Modo_Degradado**: Estado del Sistema en el que el Motor_Inferencia no puede inicializarse (por falta de soporte de hardware/navegador o recursos insuficientes) y se informa al usuario en lugar de ofrecer el chat.
- **Navegador_Compatible**: Navegador que soporta, como mínimo, WebAssembly, Service Worker, Cache API e IndexedDB, independientemente del sistema operativo o del tipo de dispositivo en el que se ejecute.
- **Manifest_App**: Archivo de manifiesto de aplicación web (manifest.json) que declara los metadatos necesarios para que el Sistema sea instalable como aplicación web progresiva, incluyendo nombre, íconos, color de tema y modo de visualización.
- **Modo_Standalone**: Modo de visualización en el que el Sistema se ejecuta como una aplicación independiente, sin la barra de direcciones ni otros elementos de la interfaz del navegador, tras haber sido instalado por el usuario.
- **Pipeline_Amplify**: Componente externo (AWS Amplify Hosting) que construye el Sistema a partir del repositorio y sirve sus assets estáticos por HTTPS, sin formar parte del tiempo de ejecución de la aplicación.

## Requirements

### Requisito 1: Detección de compatibilidad de hardware y navegador

**User Story:** Como usuario, quiero que la aplicación detecte automáticamente si mi navegador y dispositivo pueden ejecutar el modelo de IA localmente, para saber si podré usar el asistente antes de intentar cargarlo.

#### Criterios de Aceptación

1. WHEN el usuario carga la aplicación, THE Detector_Compatibilidad SHALL verificar la disponibilidad de la API WebGPU en el navegador, con un tiempo máximo de verificación de 5 segundos.
2. IF la API WebGPU no está disponible, THEN THE Detector_Compatibilidad SHALL verificar la disponibilidad de WebAssembly como mecanismo alternativo de inferencia, con un tiempo máximo de verificación de 5 segundos.
3. IF ni WebGPU ni WebAssembly están disponibles, THEN THE Sistema SHALL activar el Modo_Degradado y mostrar al usuario un mensaje explicando que el dispositivo no cumple los requisitos mínimos.
4. WHEN el Detector_Compatibilidad determina que WebGPU está disponible, THE Motor_Inferencia SHALL utilizar WebGPU como mecanismo de inferencia.
5. WHEN el Detector_Compatibilidad determina que WebGPU no está disponible pero WebAssembly sí, THE Motor_Inferencia SHALL utilizar WebAssembly como mecanismo de inferencia.
6. WHILE la Interfaz_Chat está visible en la pantalla del usuario, THE Sistema SHALL mostrar de forma persistente el mecanismo de inferencia activo (WebGPU o WASM).
7. WHEN el Detector_Compatibilidad verifica la disponibilidad de WebGPU o WebAssembly, THE Detector_Compatibilidad SHALL además verificar que el dispositivo cuente con al menos 4 GB de memoria disponible.
8. IF la memoria disponible del dispositivo es inferior a 4 GB, THEN THE Sistema SHALL activar el Modo_Degradado y mostrar al usuario un mensaje explicando que el dispositivo no cuenta con memoria suficiente.

### Requisito 2: Descarga y cacheo local de los pesos del modelo

**User Story:** Como usuario, quiero que el modelo de IA se descargue una sola vez y quede disponible sin conexión, para no depender de mi conexión a internet en usos posteriores.

#### Criterios de Aceptación

1. WHEN el usuario inicia el asistente por primera vez y los pesos del modelo no están presentes en el Cache_Modelo, THE Gestor_Descarga_Modelo SHALL descargar los archivos de pesos del modelo desde su origen configurado.
2. WHILE la descarga de los pesos del modelo está en curso, THE Sistema SHALL mostrar al usuario el progreso de descarga como un porcentaje calculado mediante (bytes descargados ÷ tamaño total en bytes) × 100, redondeado al entero más cercano, actualizado con cada fragmento recibido.
3. WHEN la descarga de los pesos del modelo finaliza correctamente, THE Service_Worker_App SHALL almacenar los archivos descargados en el Cache_Modelo.
4. FOR ALL archivos de pesos de modelo almacenados en el Cache_Modelo, THE Sistema SHALL verificar la integridad del archivo contra un checksum de referencia antes de marcarlo como disponible para inferencia.
5. WHEN el usuario inicia el asistente y los pesos del modelo ya existen en el Cache_Modelo con su integridad verificada, THE Motor_Inferencia SHALL cargar los pesos del modelo directamente desde el Cache_Modelo sin realizar una nueva descarga por red.
6. IF la descarga de los pesos del modelo se interrumpe por pérdida de conexión, es rechazada por el origen configurado, o no registra progreso durante más de 30 segundos, THEN THE Sistema SHALL descartar los datos parciales descargados, informar al usuario del fallo, y ofrecer una opción para reintentar la descarga.
7. EL checksum de referencia utilizado para la verificación de integridad SHALL provenir del mismo origen configurado del que se descargan los archivos de pesos del modelo.

### Requisito 3: Funcionamiento sin conexión de la aplicación

**User Story:** Como usuario, quiero poder usar la aplicación sin conexión a internet una vez instalada, para poder chatear con el asistente en cualquier momento y lugar.

#### Criterios de Aceptación

1. WHEN el usuario visita la aplicación por primera vez, THE Service_Worker_App SHALL registrarse ante el navegador.
2. WHEN el registro del Service_Worker_App se completa correctamente, THE Service_Worker_App SHALL almacenar los assets estáticos de la aplicación en el Cache_Assets.
3. IF el registro del Service_Worker_App falla o el almacenamiento de los assets estáticos en el Cache_Assets falla, THEN THE Sistema SHALL continuar funcionando mediante peticiones de red directas y SHALL informar al usuario que el funcionamiento sin conexión no está disponible en este dispositivo.
4. WHEN el usuario carga la aplicación sin conexión a internet y los assets estáticos y los pesos del modelo ya están cacheados, THE Sistema SHALL mostrar la Interfaz_Chat con el campo de entrada de Mensaje habilitado y el Motor_Inferencia listo para generar respuestas, sin requerir ni realizar ninguna petición de red.
5. IF el usuario carga la aplicación sin conexión a internet y los assets estáticos o los pesos del modelo no están cacheados, THEN THE Sistema SHALL informar al usuario que la carga inicial requiere una conexión a internet y SHALL impedir el acceso a la Interfaz_Chat hasta que se restablezca la conexión.
6. WHILE el navegador está sin conexión a internet, THE Sistema SHALL responder a las peticiones de assets de la aplicación utilizando el contenido del Cache_Assets en lugar de intentar una petición de red.
7. WHEN el Service_Worker_App detecta que una nueva versión de los assets de la aplicación está disponible, THE Service_Worker_App SHALL descargar la nueva versión en segundo plano sin activarla, y SHALL notificar al usuario la disponibilidad de la actualización conforme al Requisito 9.
8. WHILE el navegador está sin conexión a internet, THE Sistema SHALL indicar visualmente al usuario que la aplicación está operando sin conexión a internet.

### Requisito 4: Conversación con el asistente de IA local

**User Story:** Como usuario, quiero escribir mensajes y recibir respuestas generadas por el asistente de IA, para resolver mis dudas o mantener una conversación sin salir de la aplicación.

#### Criterios de Aceptación

1. WHEN el usuario envía un Mensaje a través de la Interfaz_Chat, THE Motor_Inferencia SHALL generar una respuesta basada en el contenido de la Conversacion activa.
2. WHILE el Motor_Inferencia está generando una respuesta, THE Interfaz_Chat SHALL mostrar los fragmentos de texto de la respuesta de forma incremental a medida que se generan.
3. WHEN el Motor_Inferencia completa la generación de una respuesta, THE Sistema SHALL agregar el Mensaje de respuesta a la Conversacion activa con el rol de asistente.
4. WHILE el Motor_Inferencia está generando una respuesta, THE Interfaz_Chat SHALL deshabilitar el envío de un nuevo Mensaje hasta que la generación en curso finalice o el usuario la cancele.
5. WHEN el usuario cancela la generación de una respuesta en curso, THE Sistema SHALL detener el Motor_Inferencia y SHALL conservar en la Conversacion el texto generado hasta ese momento.
6. IF el usuario intenta enviar un Mensaje vacío, entendido como un Mensaje que no contiene ningún carácter distinto de espacios en blanco, THEN THE Interfaz_Chat SHALL impedir el envío sin generar una petición al Motor_Inferencia.
7. IF el Motor_Inferencia no ha finalizado su inicialización cuando el usuario intenta enviar un Mensaje, THEN THE Interfaz_Chat SHALL impedir el envío y SHALL informar al usuario que el asistente aún se está preparando.
8. IF el usuario intenta enviar un Mensaje cuya longitud supera los 4000 caracteres, THEN THE Interfaz_Chat SHALL impedir el envío y SHALL informar al usuario que el Mensaje excede la longitud máxima permitida de 4000 caracteres.
9. WHEN el usuario envía un Mensaje sin que exista una Conversacion activa, THE Sistema SHALL crear una nueva Conversacion y SHALL agregar el Mensaje a dicha Conversacion antes de solicitar una respuesta al Motor_Inferencia.

### Requisito 5: Persistencia local del historial de conversaciones

**User Story:** Como usuario, quiero que mis conversaciones se guarden localmente en mi dispositivo, para poder consultarlas o continuarlas más adelante sin perder el historial.

#### Criterios de Aceptación

1. WHEN se agrega un Mensaje a una Conversacion, THE Almacen_Conversaciones SHALL persistir el Mensaje junto con su rol y marca de tiempo.
2. IF el Almacen_Conversaciones no puede completar una operación de persistencia de un Mensaje, de creación de una Conversacion o de eliminación de una Conversacion debido a un error de almacenamiento, THEN THE Sistema SHALL informar al usuario del error mediante un mensaje en la Interfaz_Chat y SHALL preservar el estado previo del Almacen_Conversaciones sin aplicar cambios parciales.
3. WHEN el usuario abre la aplicación, THE Gestor_Conversaciones SHALL cargar desde el Almacen_Conversaciones la lista de conversaciones existentes ordenadas de forma descendente por fecha de última actividad, entendida como la marca de tiempo del Mensaje más reciente de la Conversacion, o como la fecha de creación de la Conversacion si esta no contiene ningún Mensaje.
4. IF la lista de conversaciones cargada por el Gestor_Conversaciones no contiene ninguna Conversacion, THEN THE Interfaz_Chat SHALL mostrar un estado vacío que indique al usuario la ausencia de conversaciones guardadas.
5. WHEN el usuario selecciona una Conversacion existente, THE Interfaz_Chat SHALL mostrar todos los Mensaje de dicha Conversacion ordenados de forma ascendente según su marca de tiempo.
6. WHEN el usuario crea una nueva Conversacion, THE Gestor_Conversaciones SHALL generar un identificador único para la Conversacion y SHALL persistirla en el Almacen_Conversaciones.
7. WHEN el usuario elimina una Conversacion, THE Gestor_Conversaciones SHALL eliminar la Conversacion y todos sus Mensaje del Almacen_Conversaciones.
8. WHEN el usuario elimina la Conversacion que se encuentra actualmente activa en la Interfaz_Chat, THE Interfaz_Chat SHALL deseleccionar dicha Conversacion y SHALL mostrar el estado vacío definido en el criterio 4, o la Conversacion restante con la fecha de última actividad más reciente si existe al menos una.
9. THE Almacen_Conversaciones SHALL preservar el contenido íntegro de cada Conversacion almacenada, incluyendo todos sus Mensaje, a través de recargas de la aplicación.

### Requisito 6: Privacidad y ausencia de dependencias externas en tiempo de ejecución

**User Story:** Como usuario, quiero tener la certeza de que mis conversaciones no se envían a servidores externos, para confiar en la privacidad y el costo cero del asistente.

#### Criterios de Aceptación

1. WHEN el Motor_Inferencia genera una respuesta a un Mensaje, THE Sistema SHALL completar la generación utilizando exclusivamente los pesos del modelo cargados localmente y SHALL NOT realizar ninguna petición de red que contenga el contenido del Mensaje o de la Conversacion, incluyendo peticiones a servicios de inferencia de terceros.
2. THE Sistema SHALL almacenar el contenido de todas las Conversacion y Mensaje exclusivamente en el Almacen_Conversaciones del dispositivo del usuario, sin transmitir dicho contenido a través de la red en ningún momento.
3. WHEN el usuario accede a la sección de información o ayuda de la Interfaz_Chat, THE Sistema SHALL mostrar un texto visible que declare que ninguna Conversacion ni Mensaje se transmite a servidores externos durante la generación de respuestas, el almacenamiento, o cualquier otra operación del Sistema.
4. THE Sistema SHALL NOT incorporar servicios de análisis de uso, telemetría o rastreo que transmitan información del usuario o de sus Conversacion a servidores externos.

### Requisito 7: Exportación e importación de conversaciones

**User Story:** Como usuario, quiero exportar e importar mis conversaciones como archivos, para respaldarlas o transferirlas a otro dispositivo.

#### Criterios de Aceptación

1. WHEN el usuario solicita exportar una Conversacion, THE Exportador_Conversaciones SHALL generar un archivo en formato JSON que contenga el identificador, la fecha de creación, la fecha de última actividad, y todos los Mensaje de dicha Conversacion (rol, contenido y marca de tiempo) en el mismo orden en que fueron creados.
2. IF el Exportador_Conversaciones no puede generar o guardar el archivo de exportación debido a un error de escritura, THEN THE Exportador_Conversaciones SHALL informar al usuario del error y SHALL NOT dejar un archivo parcial o corrupto.
3. WHEN el usuario selecciona un archivo JSON previamente exportado para importar, THE Exportador_Conversaciones SHALL crear una nueva Conversacion en el Almacen_Conversaciones con un identificador distinto al de cualquier Conversacion existente, preservando el orden, rol, contenido y marca de tiempo de cada Mensaje contenido en el archivo.
4. IF el archivo seleccionado para importar no es un JSON válido, o es un JSON válido que carece del identificador, la fecha de creación, o un arreglo de Mensaje con rol, contenido y marca de tiempo válidos, THEN THE Exportador_Conversaciones SHALL rechazar la importación y SHALL informar al usuario del error sin modificar el Almacen_Conversaciones.
5. THE Sistema SHALL garantizar que, para toda Conversacion válida, exportarla y luego importar el archivo resultante produzca una Conversacion cuyos Mensaje coincidan en orden, rol, contenido y marca de tiempo con los de la Conversacion original, pudiendo diferir únicamente en el identificador (propiedad de ida y vuelta).

### Requisito 8: Manejo de errores del Motor_Inferencia

**User Story:** Como usuario, quiero recibir información clara cuando algo falla durante la carga o el uso del asistente, para entender qué ocurrió y qué puedo hacer al respecto.

#### Criterios de Aceptación

1. IF la inicialización del Motor_Inferencia falla por memoria insuficiente, THEN THE Sistema SHALL informar al usuario que el dispositivo no cuenta con memoria suficiente y SHALL activar el Modo_Degradado.
2. IF el Motor_Inferencia encuentra un error durante la generación de una respuesta, THEN THE Sistema SHALL detener la generación en curso, SHALL eliminar de la Interfaz_Chat el texto parcial de la respuesta generado hasta el momento del error, SHALL conservar el Mensaje original del usuario en la Interfaz_Chat, SHALL informar al usuario del error mediante un mensaje en la Interfaz_Chat, y SHALL permitir reintentar el envío del Mensaje mediante una acción explícita del usuario que reenvíe el mismo contenido del Mensaje al Motor_Inferencia para generar una nueva respuesta.
3. IF el Cache_Modelo contiene un archivo de pesos del modelo cuya verificación de integridad falla, THEN THE Gestor_Descarga_Modelo SHALL eliminar el archivo corrupto del Cache_Modelo, SHALL informar al usuario mediante un mensaje en la Interfaz_Chat que el archivo del modelo estaba dañado, y SHALL iniciar automáticamente una nueva descarga del modelo.
4. IF la nueva descarga del modelo iniciada tras la eliminación de un archivo corrupto también falla, THEN THE Sistema SHALL informar al usuario mediante un mensaje en la Interfaz_Chat que la descarga del modelo no pudo completarse y SHALL activar el Modo_Degradado.
5. IF la inicialización del Motor_Inferencia falla por una causa distinta a memoria insuficiente, THEN THE Sistema SHALL informar al usuario mediante un mensaje en la Interfaz_Chat que el asistente no pudo inicializarse y SHALL activar el Modo_Degradado.

### Requisito 9: Gestión del ciclo de vida del Service Worker

**User Story:** Como usuario, quiero que las actualizaciones de la aplicación se apliquen de forma predecible, para no encontrarme con comportamientos inconsistentes entre sesiones.

#### Criterios de Aceptación

1. WHEN el Sistema detecta una nueva versión del Service_Worker_App, THE Sistema SHALL notificar al usuario, de forma visible en la Interfaz_Chat, que hay una actualización disponible, y SHALL mantener dicha notificación visible hasta que el usuario la acepte o la descarte explícitamente.
2. WHEN el usuario acepta aplicar la actualización disponible desde la notificación, THE Service_Worker_App SHALL activar la nueva versión del Service_Worker_App.
3. THE Service_Worker_App SHALL conservar el Cache_Modelo existente al aplicar una actualización de los assets de la aplicación, salvo que la nueva versión requiera explícitamente una versión distinta del modelo, en cuyo caso THE Service_Worker_App SHALL eliminar del Cache_Modelo los archivos correspondientes a la versión anterior del modelo y SHALL solicitar al Gestor_Descarga_Modelo la descarga de la versión requerida.
4. WHEN el Service_Worker_App activa la nueva versión, THE Sistema SHALL recargar la aplicación, salvo que el Motor_Inferencia esté generando una respuesta en ese momento.
5. WHILE el Motor_Inferencia está generando una respuesta, THE Sistema SHALL posponer la recarga de la aplicación asociada a la activación de una nueva versión del Service_Worker_App hasta que dicha generación finalice.
6. IF el usuario descarta la notificación de actualización o no responde a ella, THEN THE Sistema SHALL continuar utilizando la versión actual del Service_Worker_App sin interrumpir su funcionamiento.

### Requisito 10: Uso en múltiples dispositivos y compatibilidad con navegadores modernos

**User Story:** Como usuario, quiero poder usar el asistente tanto desde mi celular como desde mi computador en cualquier navegador moderno, para acceder a la aplicación desde el dispositivo que tenga disponible en cada momento.

#### Criterios de Aceptación

1. WHEN el usuario carga la aplicación desde un dispositivo con un ancho de pantalla propio de un celular, THE Interfaz_Chat SHALL adaptar su diseño a dicho ancho de pantalla de forma que el campo de entrada de Mensaje, el historial de la Conversacion activa y la lista de conversaciones permanezcan accesibles sin requerir desplazamiento horizontal.
2. WHEN el usuario carga la aplicación desde un dispositivo con un ancho de pantalla propio de un computador de escritorio, THE Interfaz_Chat SHALL adaptar su diseño a dicho ancho de pantalla de forma que el campo de entrada de Mensaje, el historial de la Conversacion activa y la lista de conversaciones permanezcan accesibles sin requerir desplazamiento horizontal.
3. WHEN el usuario cambia la orientación de la pantalla de su dispositivo entre vertical y horizontal, THE Interfaz_Chat SHALL reajustar su diseño manteniendo visibles el campo de entrada de Mensaje y el Mensaje más reciente de la Conversacion activa.
4. THE Sistema SHALL declarar, en la sección de información o ayuda de la Interfaz_Chat, el conjunto de Navegador_Compatible soportados en función de las APIs requeridas (WebGPU o WebAssembly, Service Worker, Cache API e IndexedDB), sin exigir un navegador o sistema operativo específico.
5. WHEN el usuario carga la aplicación desde un Navegador_Compatible, THE Sistema SHALL ofrecer la Interfaz_Chat con las mismas funcionalidades descritas en los Requisitos 1 a 9, independientemente del sistema operativo o del tipo de dispositivo utilizado.
6. IF el navegador del usuario no cumple los requisitos mínimos para ser un Navegador_Compatible, THEN THE Sistema SHALL informar al usuario cuáles capacidades faltan y SHALL activar el Modo_Degradado.

### Requisito 11: Instalabilidad como aplicación web progresiva (PWA)

**User Story:** Como usuario, quiero poder instalar la aplicación en mi celular o computador como si fuera una aplicación nativa, para acceder a ella rápidamente sin depender de un marcador o pestaña del navegador.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer un Manifest_App enlazado desde el documento principal de la aplicación, que declare el nombre de la aplicación, un nombre corto, al menos un ícono en formato adecuado para instalación, un color de tema, y el modo de visualización configurado como Modo_Standalone.
2. WHEN el navegador del usuario determina que se cumplen los criterios de instalabilidad y emite el evento de instalación disponible, THE Sistema SHALL capturar dicho evento y SHALL ofrecer al usuario un control visible en la Interfaz_Chat para iniciar la instalación de la aplicación.
3. WHEN el usuario activa el control de instalación provisto por el Sistema, THE Sistema SHALL invocar el mecanismo de instalación del navegador y SHALL mostrar al usuario el resultado de la instalación (completada o cancelada) una vez que el navegador lo reporte.
4. WHEN el usuario abre la aplicación previamente instalada, THE Sistema SHALL ejecutarse en Modo_Standalone conforme a lo declarado en el Manifest_App.
5. WHILE el Sistema se ejecuta en Modo_Standalone, THE Sistema SHALL ofrecer las mismas funcionalidades descritas en los Requisitos 1 a 10 disponibles cuando se ejecuta dentro de una pestaña del navegador.
6. IF el navegador del usuario no soporta la instalación de aplicaciones web o no emite el evento de instalación disponible, THEN THE Sistema SHALL permitir el uso completo de la Interfaz_Chat dentro del navegador sin mostrar el control de instalación.

### Requisito 12: Despliegue y alojamiento en AWS Amplify Hosting

**User Story:** Como responsable de publicar el Sistema, quiero que se despliegue automáticamente en AWS Amplify Hosting a partir del repositorio, para que los usuarios accedan a la última versión mediante una URL HTTPS estable sin mantener infraestructura propia.

#### Criterios de Aceptación

1. WHEN se hace push a la rama de despliegue configurada, THE Pipeline_Amplify SHALL ejecutar `npm run lint`, `npm run test` y `npm run build`, en ese orden, y SHALL publicar el contenido de `dist/` únicamente si los tres pasos finalizan sin errores.
2. IF `npm run lint`, `npm run test` o `npm run build` falla, THEN THE Pipeline_Amplify SHALL abortar la publicación y SHALL mantener disponible para los usuarios la versión previamente desplegada.
3. THE Pipeline_Amplify SHALL servir el Sistema exclusivamente sobre HTTPS, dado que Service_Worker_App, WebGPU, WebAssembly e IndexedDB requieren un contexto seguro para funcionar en el navegador.
4. THE Pipeline_Amplify SHALL actuar únicamente como distribución de assets estáticos (HTML, CSS, JS, Manifest_App, íconos) y SHALL NOT ejecutar código de aplicación propio en tiempo de petición ni introducir ninguna llamada de red que contenga contenido de Mensaje o Conversacion, coherente con el Requisito 6.
5. THE Pipeline_Amplify SHALL configurar el documento principal (`index.html`) y el archivo del Service_Worker_App con cabeceras que impidan su cacheo indefinido por parte de la CDN, de forma que el mecanismo de detección de actualizaciones del Requisito 9 siga funcionando tras cada despliegue.
6. THE Sistema SHALL quedar accesible mediante una URL provista por AWS Amplify Hosting sin requerir variables de entorno con secretos ni credenciales de servicios externos en tiempo de build o de runtime, coherente con el Requisito 6.
