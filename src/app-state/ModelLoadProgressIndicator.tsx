// App_State: renders WebLLM's real model-loading progress in the boot
// loading screen (Requisito 2.2), instead of the indeterminate placeholder
// that used to be there permanently. Presentational only -- reads
// `modelLoadProgress`/`compatibility` from `useAppState()` and formats them.
//
// Two states:
// - No report yet (`modelLoadProgress === null`, e.g. right after mount or
//   while WebLLM is still resolving the model's cache manifest): falls back
//   to the original indeterminate bar, since there's no real data to show.
// - A report has arrived: a determinate bar for the CURRENT phase (0-100%
//   WITHIN that phase, see `modelLoadProgress.ts` -- WebLLM doesn't report a
//   single combined total), plus the phase label, transfer detail, and which
//   model variant was selected (visible for the still-open Android/iOS
//   diagnosis, since it's otherwise invisible on a real device).

import { useAppState } from "./useAppState";
import { modelLoadPhaseLabel } from "./modelLoadProgress";
import { modelDescriptorForTier } from "./configuration";

function formatSizeGb(megabytes: number): string {
  return (megabytes / 1024).toFixed(1).replace(".", ",");
}

export function ModelLoadProgressIndicator() {
  const { modelLoadProgress, compatibility } = useAppState();

  const modelDescriptor =
    compatibility !== null
      ? modelDescriptorForTier(compatibility.modelTier, compatibility.shaderF16Available)
      : null;
  const tierLabel =
    compatibility?.modelTier === "compact" ? "versión compacta (móvil)" : "versión completa (escritorio)";

  if (modelLoadProgress === null) {
    return (
      <div className="state-screen__progress-bar" role="progressbar" aria-label="Preparando el asistente…" />
    );
  }

  const phaseLabel = modelLoadPhaseLabel(modelLoadProgress.phase);
  const stepSuffix =
    modelLoadProgress.step !== null
      ? ` (fragmento ${modelLoadProgress.step.current.toString()}/${modelLoadProgress.step.total.toString()})`
      : "";
  // Elapsed seconds alone (e.g. "0 s" right as the "starting" phase begins)
  // isn't meaningful on its own -- only shown alongside a transfer amount or
  // once real time has actually passed.
  const showDetail = modelLoadProgress.megabytes !== null || modelLoadProgress.secondsElapsed > 0;
  const detailParts = showDetail
    ? [
        modelLoadProgress.megabytes !== null ? `${modelLoadProgress.megabytes.toString()} MB` : null,
        `${modelLoadProgress.secondsElapsed.toString()} s`,
      ].filter((part): part is string => part !== null)
    : [];

  return (
    <div className="model-load-progress">
      <p className="model-load-progress__phase">
        {phaseLabel}
        {stepSuffix}
      </p>
      <div
        className="state-screen__progress-bar state-screen__progress-bar--determinate"
        role="progressbar"
        aria-label={phaseLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={modelLoadProgress.percentage}
        aria-valuetext={`${phaseLabel}, ${modelLoadProgress.percentage.toString()}%`}
        style={{ ["--model-load-progress-percentage" as string]: `${modelLoadProgress.percentage.toString()}%` }}
      />
      {detailParts.length > 0 ? <p className="model-load-progress__detail">{detailParts.join(" · ")}</p> : null}
      {modelDescriptor !== null ? (
        <p className="model-load-progress__model">
          {modelDescriptor.displayName} · ~{formatSizeGb(modelDescriptor.approximateSizeMb)} GB · {tierLabel}
        </p>
      ) : null}
    </div>
  );
}
