// Tests for `ConversationList` (task 17.1).
//
// The component is rendered inside `NotificationProvider` +
// `AppStateProvider`, injecting test doubles for `detectFn`, `decideFn` and
// `createInferenceEngine` (same pattern as `AppStateProvider.test.tsx`),
// with `createConversationManager` built over `fake-indexeddb` to exercise
// the real create/select/delete conversation flow without mocking business
// logic.
//
// See .kiro/specs/asistente-ia-local/requirements.md (5.3, 5.4, 5.5, 5.8).

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationProvider } from "../notification";
import { AppStateProvider } from "../app-state/AppStateProvider";
import type { AppStateProviderProps } from "../app-state/AppStateProvider";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "../compatibility-detector/decide";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import { ConversationList, EMPTY_STATE_TEXT } from "./ConversationList";

beforeEach(() => {
  // fake-indexeddb doesn't isolate automatically between tests (same
  // pattern as ConversationStore.test.ts / AppStateProvider.test.tsx).
  indexedDB.deleteDatabase("ConversationStore");
});

function createTestConversationManager(): ConversationManager {
  return new ConversationManager(new ConversationStoreDexie());
}

function createFakeInferenceEngine(): InferenceEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(),
    cancel: vi.fn(),
  };
}

const ANY_PROBE: DecideInput = {
  webgpuAvailable: true,
  wasmAvailable: true,
  memoryGB: 8,
};

const RESULT_WITH_ENGINE: CompatibilityResult = {
  webgpuAvailable: true,
  wasmAvailable: false,
  memoryGB: 8,
  selectedEngine: "webgpu",
  missingCapabilities: [],
};

/**
 * Test `ModelDownloadManager`: resolves immediately with no real I/O.
 * Needed since task 22.2, as `AppStateProvider`'s production default is no
 * longer `undefined` (it would attempt a real `fetch`).
 */
function createTestModelDownloadManager(): ModelDownloadManager {
  return { ensureModelAvailable: vi.fn().mockResolvedValue(undefined) };
}

function renderWithProviders(props: Partial<AppStateProviderProps> = {}) {
  return render(
    <NotificationProvider>
      <AppStateProvider
        detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
        decideFn={vi.fn().mockReturnValue(RESULT_WITH_ENGINE)}
        createInferenceEngine={createFakeInferenceEngine}
        createConversationManager={createTestConversationManager}
        modelDownloadManager={createTestModelDownloadManager()}
        {...props}
      >
        <ConversationList />
      </AppStateProvider>
    </NotificationProvider>,
  );
}

/** Waits for `AppStateProvider`'s boot sequence to finish. */
async function waitForBoot(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByText(/preparando el asistente/i)).not.toBeInTheDocument();
  });
}

describe("ConversationList", () => {
  it("shows the empty state when there are no saved conversations (5.4)", async () => {
    renderWithProviders();
    await waitForBoot();

    expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
  });

  it("renders conversations in the order provided by the global state (5.3)", async () => {
    const manager = createTestConversationManager();
    const older = await manager.createConversation();
    await manager.deleteConversation(older.id); // clears this helper instance's selection

    // Creates two conversations via a helper manager to populate the store
    // before mounting the component (same underlying ConversationStore ->
    // same fake-indexeddb base).
    const conversationA = await manager.createConversation();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const conversationB = await manager.createConversation();

    renderWithProviders();
    await waitForBoot();

    const buttons = await screen.findAllByRole("button", { name: new Date(conversationB.createdAt).toLocaleString() });
    expect(buttons.length).toBeGreaterThan(0);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [first, second] = items;
    // The most recent (conversationB) must appear first (descending order).
    expect(first?.textContent).toContain(new Date(conversationB.createdAt).toLocaleString());
    expect(second?.textContent).toContain(new Date(conversationA.createdAt).toLocaleString());
  });

  it("marks a conversation as active when clicked (5.5)", async () => {
    const manager = createTestConversationManager();
    const conversation = await manager.createConversation();

    renderWithProviders();
    await waitForBoot();

    const label = new Date(conversation.createdAt).toLocaleString();
    const button = await screen.findByRole("button", { name: label });

    expect(button).toHaveAttribute("aria-current", "false");

    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute("aria-current", "true");
    });
  });

  it("deselects the active conversation and shows the empty state when deleting it leaves none (5.8)", async () => {
    const manager = createTestConversationManager();
    const conversation = await manager.createConversation();

    renderWithProviders();
    await waitForBoot();

    const label = new Date(conversation.createdAt).toLocaleString();
    const selectButton = await screen.findByRole("button", { name: label });

    const user = userEvent.setup();
    await user.click(selectButton);
    await waitFor(() => {
      expect(selectButton).toHaveAttribute("aria-current", "true");
    });

    const deleteButton = screen.getByRole("button", { name: `Eliminar conversación ${label}` });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
    });
  });

  it("adds a new conversation to the list when created (5.6)", async () => {
    renderWithProviders();
    await waitForBoot();

    expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));

    await waitFor(() => {
      expect(screen.queryByText(EMPTY_STATE_TEXT)).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  describe("export/import (Requirement 7)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("the Export button triggers downloadExportedFile and shows an error notification if it fails (7.1, 7.2)", async () => {
      const manager = createTestConversationManager();
      const conversation = await manager.createConversation();

      // Forces the file-write failure (same mechanism as
      // downloadExportedFile.test.ts): createObjectURL throws.
      vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
        throw new Error("fallo simulado de createObjectURL");
      });

      renderWithProviders();
      await waitForBoot();

      const label = new Date(conversation.createdAt).toLocaleString();
      const exportButton = await screen.findByRole("button", { name: `Exportar conversación ${label}` });

      const user = userEvent.setup();
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText("No se pudo exportar la conversación. Intenta de nuevo.")).toBeInTheDocument();
      });
    });

    it("importing a valid JSON file adds a new conversation to the list without showing an error (7.3)", async () => {
      renderWithProviders();
      await waitForBoot();

      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();

      const validFile = new File(
        [
          JSON.stringify({
            id: "id-original",
            createdAt: 1000,
            messages: [{ role: "user", content: "hola importado", timestamp: 1100 }],
          }),
        ],
        "conversacion.json",
        { type: "application/json" },
      );

      const user = userEvent.setup();
      const importInput = screen.getByLabelText("Importar conversación desde archivo");
      await user.upload(importInput, validFile);

      await waitFor(() => {
        expect(screen.queryByText(EMPTY_STATE_TEXT)).not.toBeInTheDocument();
      });
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      expect(screen.queryByText(/no es un JSON válido/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/no tiene el formato esperado/i)).not.toBeInTheDocument();
    });

    it("importing a file with invalid JSON shows an error and adds no conversation (7.4)", async () => {
      renderWithProviders();
      await waitForBoot();

      const invalidFile = new File(["esto no es json {"], "roto.json", { type: "application/json" });

      const user = userEvent.setup();
      const importInput = screen.getByLabelText("Importar conversación desde archivo");
      await user.upload(importInput, invalidFile);

      await waitFor(() => {
        expect(screen.getByText("El archivo seleccionado no es un JSON válido.")).toBeInTheDocument();
      });
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
    });

    it("importing a file with valid JSON but an invalid schema shows the corresponding error without adding anything (7.4)", async () => {
      renderWithProviders();
      await waitForBoot();

      const invalidSchemaFile = new File(
        [JSON.stringify({ foo: "bar" })],
        "esquema-invalido.json",
        { type: "application/json" },
      );

      const user = userEvent.setup();
      const importInput = screen.getByLabelText("Importar conversación desde archivo");
      await user.upload(importInput, invalidSchemaFile);

      await waitFor(() => {
        expect(
          screen.getByText("El archivo no tiene el formato esperado de una conversación exportada."),
        ).toBeInTheDocument();
      });
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
    });

    it("importing a file over the size limit shows an error and adds no conversation", async () => {
      renderWithProviders();
      await waitForBoot();

      // Content doesn't matter (and is never read: the size check
      // short-circuits before it) -- only `file.size` does, so a raw byte
      // buffer is enough, no need to serialize an actual huge conversation.
      const oversizedFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "enorme.json", {
        type: "application/json",
      });

      const user = userEvent.setup();
      const importInput = screen.getByLabelText("Importar conversación desde archivo");
      await user.upload(importInput, oversizedFile);

      await waitFor(() => {
        expect(
          screen.getByText(/supera el tamaño máximo permitido para importar/i),
        ).toBeInTheDocument();
      });
      expect(screen.getByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
    });
  });
});
