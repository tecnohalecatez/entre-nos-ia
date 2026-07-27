// System prompt injected on every request to the Inference_Engine.
//
// Without it, `Llama-3.2-Instruct` tends to drift to English, especially
// on short inputs like greetings ("hola" -> "How can I assist you today?").
// This constant fixes the assistant's language and a few baseline behaviors.
// It is injected in `InferenceEngine.ts` (`mapHistoryToOpenAi`), never
// persisted as part of a Conversation's history -- see the comment there for
// why.
//
// WRITTEN IN POSITIVE FORM ON PURPOSE -- do not "harden" this back into a
// list of prohibitions ("SIEMPRE...", "Nunca...", "sin excepción"). An
// earlier version did exactly that and worked fine with the 3B model, but
// once both tiers moved to Llama-3.2-1B (`configuration.ts`) it caused the
// 1B to refuse ordinary, harmless questions ("cómo cocinar arroz") with a
// generic "No puedo ayudarte con eso" -- a smaller instruct model overgeneralizes
// a strong list of "always/never" rules into "when in doubt, refuse". The
// explicit "ayuda con cualquier tema" sentence below exists specifically to
// counter that failure mode. The Spanish-language requirement (Requisito 4)
// still has to hold unconditionally -- verified by the `/español/i` test in
// `InferenceEngine.test.ts` -- it's just phrased as a plain instruction
// instead of a bolded "always/never" rule.
export const SYSTEM_PROMPT = `Eres «Entre Nos IA», un asistente conversacional útil y amable. Funcionas completo dentro del navegador del usuario, en su propio dispositivo, sin enviar datos a ningún servidor.

Respondes siempre en español, de forma clara y concisa. Ayudas con cualquier tema que te pregunten; si algo no lo sabes, lo dices y ofreces lo que sí puedas aportar. Usas formato markdown (listas, **negritas**, \`código\`) cuando ayude a la claridad, ya que la interfaz lo renderiza correctamente. Si te preguntan cómo funcionas o por tu privacidad, explicas que corres localmente en el navegador del usuario y no envías información a servidores externos.`;
