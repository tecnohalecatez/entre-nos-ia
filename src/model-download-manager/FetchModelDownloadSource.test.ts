// Unit tests for `FetchModelDownloadSource` (task 22.2).
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// and requirements.md (Requisitos 2.1, 2.2, 2.7).
//
// `fetch`/`Response`/`ReadableStream` are mocked/stubbed with `vi.stubGlobal`,
// following the same approach as `ensureModelAvailable.integration.test.ts`
// (task 7.6), but here exercising the production file directly.

import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchModelDownloadSource } from "./FetchModelDownloadSource";

const WEIGHTS_URL = "https://modelo.local/modelos/pesos.bin";
const CHECKSUM_URL = "https://modelo.local/modelos/pesos.bin.sha256";

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

function createStreamResponse(totalBytes: number, chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-length": String(totalBytes) } });
}

describe("FetchModelDownloadSource", () => {
  let fetchMock: FetchMock;
  let source: FetchModelDownloadSource;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup(): void {
    fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
    vi.stubGlobal("fetch", fetchMock);
    source = new FetchModelDownloadSource(WEIGHTS_URL, CHECKSUM_URL);
  }

  it("getReferenceChecksum() returns the (trimmed) text of the successful HTTP response (2.7)", async () => {
    setup();
    fetchMock.mockResolvedValue(new Response("  abcdef123456  \n"));

    const checksum = await source.getReferenceChecksum();

    expect(checksum).toBe("abcdef123456");
    expect(fetchMock).toHaveBeenCalledWith(CHECKSUM_URL);
  });

  it("getReferenceChecksum() throws if the HTTP response is not successful", async () => {
    setup();
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(source.getReferenceChecksum()).rejects.toThrow(/404/);
  });

  it("download() combines the received chunks and reports incremental progress for each one (2.1, 2.2)", async () => {
    setup();
    const chunkA = new Uint8Array([1, 2, 3]);
    const chunkB = new Uint8Array([4, 5]);
    fetchMock.mockImplementation((url) => {
      expect(url).toBe(WEIGHTS_URL);
      return Promise.resolve(createStreamResponse(5, [chunkA, chunkB]));
    });

    const onChunk = vi.fn();
    const controller = new AbortController();
    const result = await source.download(onChunk, controller.signal);

    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(onChunk).toHaveBeenNthCalledWith(1, 3, 5);
    expect(onChunk).toHaveBeenNthCalledWith(2, 5, 5);
  });

  it("download() forwards the received AbortSignal to fetch()", async () => {
    setup();
    fetchMock.mockImplementation((_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      return Promise.resolve(createStreamResponse(0, []));
    });

    const controller = new AbortController();
    await source.download(vi.fn(), controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("download() throws if the HTTP response is not successful or has no body", async () => {
    setup();
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const controller = new AbortController();
    await expect(source.download(vi.fn(), controller.signal)).rejects.toThrow(/500/);
  });
});
