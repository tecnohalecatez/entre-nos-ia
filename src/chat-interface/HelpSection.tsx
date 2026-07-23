// Chat_Interface's information/help section (task 19.3).
//
// Static presentation component: doesn't depend on app state or required
// props. Declares two things mandated by the privacy and compatibility
// requirements:
//
// 1. The privacy declaration (6.3): no Conversation or Message is
//    transmitted to external servers during response generation, storage,
//    or any other System operation.
// 2. The list of browser capabilities that define a Navegador_Compatible
//    (10.4): WebGPU or WebAssembly, Service Worker, Cache API and
//    IndexedDB -- without requiring a specific browser or OS.

import './HelpSection.css'

/** Minimum capabilities that define a Navegador_Compatible, as enumerated
 * in design.md's Glossary and in Requirement 10.4. */
const COMPATIBLE_BROWSER_CAPABILITIES = [
  'WebGPU o, como alternativa, WebAssembly (para ejecutar el modelo de IA localmente)',
  'Service Worker (para el funcionamiento sin conexión)',
  'Cache API (para almacenar los archivos de la aplicación y del modelo)',
  'IndexedDB (para guardar tus conversaciones en tu dispositivo)',
] as const

export function HelpSection() {
  return (
    <section aria-label="Información y ayuda" className="help-section">
      <h2>Privacidad</h2>
      <p>
        Ninguna de tus conversaciones ni mensajes se transmite a servidores
        externos, ni durante la generación de respuestas, ni al guardarlas,
        ni en ninguna otra operación de esta aplicación. Todo el
        procesamiento y el almacenamiento ocurren únicamente en tu
        dispositivo.
      </p>

      <h2>Navegadores compatibles</h2>
      <p>
        Esta aplicación funciona en cualquier navegador que cuente, como
        mínimo, con las siguientes capacidades, sin requerir un navegador o
        sistema operativo específico:
      </p>
      <ul>
        {COMPATIBLE_BROWSER_CAPABILITIES.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
    </section>
  )
}
