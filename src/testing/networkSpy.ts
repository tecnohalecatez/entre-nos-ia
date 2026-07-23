// Reusable test harness that intercepts `fetch`/`XMLHttpRequest`/`WebSocket`
// for the Local AI Assistant's privacy tests.
// See .kiro/specs/asistente-ia-local/design.md (section "Correctness
// Properties", Property 10: "Absence of content transmission over network")
// and Requirements 6.1, 6.2.
//
// Replaces the three network mechanisms of the test environment (happy-dom)
// with doubles that record every invocation (URL, method, body, headers)
// without performing any real network request, so that tests are
// deterministic and can verify that no Message/Conversation content is
// transmitted over the network.

/** Intercepted network mechanism that originated a captured request. */
export type NetworkRequestType = "fetch" | "xhr" | "websocket";

/** Descriptor of a network invocation intercepted by the spy. */
export interface CapturedNetworkRequest {
  type: NetworkRequestType;
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

/** Handle returned by `installNetworkSpy()` to inspect and uninstall the spy. */
export interface NetworkSpy {
  /** All requests intercepted since the spy was installed, in order. */
  readonly requests: readonly CapturedNetworkRequest[];
  /** Restores `fetch`, `XMLHttpRequest` and `WebSocket` to their original values. */
  restore(): void;
  /**
   * `true` if any captured request contains `substring` in its URL, its
   * body, or the value of any of its headers.
   */
  containsSubstring(substring: string): boolean;
}

/**
 * Best-effort synchronous conversion of a request body to text, for the
 * representative cases of a content leak (strings, and the shapes in which
 * `JSON.stringify(message)` or similar objects end up traveling). Bodies
 * that can only be read asynchronously (`Blob`, `FormData`, streams) are not
 * captured; this is an accepted limitation of the test harness, documented
 * here.
 */
function synchronousBodyText(body: unknown): string | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    );
  }

  return undefined;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const record: Record<string, string> = {};
  for (const [key, value] of new Headers(headers).entries()) {
    record[key] = value;
  }

  return Object.keys(record).length > 0 ? record : undefined;
}

function createEntry(
  type: NetworkRequestType,
  url: string,
  method: string | undefined,
  body: string | undefined,
  headers: Record<string, string> | undefined,
): CapturedNetworkRequest {
  return {
    type,
    url,
    ...(method !== undefined ? { method } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };
}

function createFetchSpy(requests: CapturedNetworkRequest[]): typeof fetch {
  return function fetchSpy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;
    let method: string | undefined;
    let headers: Record<string, string> | undefined;

    if (input instanceof Request) {
      url = input.url;
      method = input.method;
      headers = headersToRecord(input.headers);
    } else {
      url = input instanceof URL ? input.href : input;
      method = init?.method ?? "GET";
      headers = headersToRecord(init?.headers);
    }

    // The body of an already-constructed `Request` is only readable
    // asynchronously; it's only captured when passed as `init.body`.
    const body = input instanceof Request ? undefined : synchronousBodyText(init?.body);

    requests.push(createEntry("fetch", url, method, body, headers));

    return Promise.resolve(new Response(null, { status: 200, statusText: "OK" }));
  };
}

function createXMLHttpRequestSpy(requests: CapturedNetworkRequest[]): typeof XMLHttpRequest {
  class XMLHttpRequestSpy {
    private currentMethod = "GET";
    private currentUrl = "";
    private readonly currentHeaders: Record<string, string> = {};

    readyState = 4;
    status = 200;
    statusText = "OK";
    response: unknown = "";
    responseText = "";
    onreadystatechange: (() => void) | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    open(method: string, url: string | URL): void {
      this.currentMethod = method;
      this.currentUrl = url instanceof URL ? url.href : url;
    }

    setRequestHeader(name: string, value: string): void {
      this.currentHeaders[name] = value;
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      const requestBody = body instanceof Document ? undefined : body;
      const bodyText = synchronousBodyText(requestBody);
      const headers =
        Object.keys(this.currentHeaders).length > 0 ? { ...this.currentHeaders } : undefined;

      requests.push(createEntry("xhr", this.currentUrl, this.currentMethod, bodyText, headers));

      this.onreadystatechange?.();
      this.onload?.();
    }

    abort(): void {
      // No-op: there is no real request in flight to abort.
    }
    addEventListener(): void {
      // No-op: the harness's tests use onload/onreadystatechange directly.
    }
    removeEventListener(): void {
      // No-op: see addEventListener.
    }
    dispatchEvent(): boolean {
      return false;
    }
    getAllResponseHeaders(): string {
      return "";
    }
    getResponseHeader(): string | null {
      return null;
    }
  }

  return XMLHttpRequestSpy as unknown as typeof XMLHttpRequest;
}

function createWebSocketSpy(requests: CapturedNetworkRequest[]): typeof WebSocket {
  class WebSocketSpy {
    readonly url: string;
    readyState = 1;

    constructor(url: string | URL, protocols?: string | string[]) {
      this.url = url instanceof URL ? url.href : url;

      const headers =
        protocols !== undefined
          ? { "sec-websocket-protocol": Array.isArray(protocols) ? protocols.join(", ") : protocols }
          : undefined;

      requests.push(createEntry("websocket", this.url, undefined, undefined, headers));
    }

    send(data: string | ArrayBuffer | ArrayBufferView | Blob): void {
      const body = synchronousBodyText(data);
      requests.push(createEntry("websocket", this.url, undefined, body, undefined));
    }

    close(): void {
      // No-op: there is no real connection to close.
    }
    addEventListener(): void {
      // No-op: this double does not dispatch asynchronous events.
    }
    removeEventListener(): void {
      // No-op: see addEventListener.
    }
    dispatchEvent(): boolean {
      return false;
    }
  }

  return WebSocketSpy as unknown as typeof WebSocket;
}

/**
 * Installs the global network spy: replaces `fetch`, `XMLHttpRequest` and
 * `WebSocket` with doubles that record every invocation without performing
 * any real network request, and returns a handle to inspect the captured
 * requests and restore the original globals.
 *
 * Typical usage in a test (`beforeEach`/`afterEach`):
 *
 * ```ts
 * let networkSpy: NetworkSpy;
 * beforeEach(() => { networkSpy = installNetworkSpy(); });
 * afterEach(() => { networkSpy.restore(); });
 * ```
 */
export function installNetworkSpy(): NetworkSpy {
  const requests: CapturedNetworkRequest[] = [];

  const originalFetch = globalThis.fetch;
  const originalXHR = globalThis.XMLHttpRequest;
  const originalWebSocket = globalThis.WebSocket;

  globalThis.fetch = createFetchSpy(requests);
  globalThis.XMLHttpRequest = createXMLHttpRequestSpy(requests);
  globalThis.WebSocket = createWebSocketSpy(requests);

  return {
    requests,
    restore(): void {
      globalThis.fetch = originalFetch;
      globalThis.XMLHttpRequest = originalXHR;
      globalThis.WebSocket = originalWebSocket;
    },
    containsSubstring(substring: string): boolean {
      return requests.some(
        (request) =>
          request.url.includes(substring) ||
          (request.body?.includes(substring) ?? false) ||
          Object.values(request.headers ?? {}).some((value) => value.includes(substring)),
      );
    },
  };
}
