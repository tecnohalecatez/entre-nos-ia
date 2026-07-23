// App_State: boot configuration shared by `AppStateProvider`.
//
// The model identifier must be kept manually in sync with
// `REQUIRED_MODEL_VERSION` in `src/service-worker-app/sw.ts` (same design
// note there: in the absence of a build-level model-versioning pipeline, it
// is fixed as a source-code constant).
//
// Must match EXACTLY a `model_id` from WebLLM's prebuilt model catalog
// (`webllm.prebuiltAppConfig.model_list`, hosted by MLC-AI on Hugging Face)
// -- WebLLM resolves and downloads the weight shards for this id
// automatically when calling `CreateMLCEngine(modelId)` (see
// `InferenceEngine.ts`), without needing our own origin URL. See the full
// list of valid ids at
// https://github.com/mlc-ai/web-llm/blob/main/src/config.ts.
export const MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

// --- Model download and caching (Requirements 2.1, 2.3, 2.5) ---------------
//
// WebLLM manages downloading and caching the model weights internally
// (browser Cache API) when initializing `MLCEngine` with `MODEL_ID`: it
// downloads the shards the first time and reuses them from cache on
// subsequent initializations, directly satisfying 2.1/2.3/2.5 without
// needing our own download/checksum pipeline or an origin URL configured by
// this project (there's no backend/CDN of our own, see design.md, pillar
// "Zero application server at runtime").
//
// The `ModelDownloadManager` in `src/model-download-manager/` (with sha256
// checksum integrity verification, Property 3) still exists as an
// independently-tested component (Property-Based Testing), but
// `AppStateProvider` does NOT invoke it during real boot: there's no single
// weight file for that pipeline to target, since WebLLM splits the weights
// into multiple shards resolved internally from `MODEL_ID`, not from a
// single-file URL.
