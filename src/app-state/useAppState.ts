import { useContext } from "react";
import { AppStateContext, type AppStateContextValue } from "./context";

/** Hook to access the global app context (see `AppStateProvider`). */
export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (context === null) {
    throw new Error("useAppState() must be used within an <AppStateProvider>");
  }
  return context;
}
