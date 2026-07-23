import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installNetworkSpy, type NetworkSpy } from "./networkSpy";

describe("installNetworkSpy", () => {
  let networkSpy: NetworkSpy;

  beforeEach(() => {
    networkSpy = installNetworkSpy();
  });

  afterEach(() => {
    networkSpy.restore();
  });

  it("captures a fetch invocation with URL, method, body and headers", async () => {
    await fetch("https://example.test/api", {
      method: "POST",
      body: "secret-content",
      headers: { "X-Custom": "header-value" },
    });

    expect(networkSpy.requests).toHaveLength(1);
    expect(networkSpy.requests[0]).toMatchObject({
      type: "fetch",
      url: "https://example.test/api",
      method: "POST",
      body: "secret-content",
    });
    expect(networkSpy.containsSubstring("header-value")).toBe(true);
  });

  it("does not perform any real network request when calling fetch", async () => {
    // If this performed a real request, it would fail or hang in a test
    // environment without network access; with the spy installed it must
    // resolve immediately.
    const response = await fetch("https://nonexistent-domain.invalid/x");
    expect(response.status).toBe(200);
  });

  it("captures open/send of XMLHttpRequest with URL, method and body", () => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "https://example.test/xhr");
    xhr.setRequestHeader("Content-Type", "text/plain");
    xhr.send("xhr-body");

    expect(networkSpy.requests).toHaveLength(1);
    expect(networkSpy.requests[0]).toMatchObject({
      type: "xhr",
      url: "https://example.test/xhr",
      method: "PUT",
      body: "xhr-body",
      headers: { "Content-Type": "text/plain" },
    });
  });

  it("captures the construction and sending of data over WebSocket", () => {
    const ws = new WebSocket("wss://example.test/socket");
    ws.send("websocket-message");

    expect(networkSpy.requests).toHaveLength(2);
    expect(networkSpy.requests[0]).toMatchObject({
      type: "websocket",
      url: "wss://example.test/socket",
    });
    expect(networkSpy.requests[1]).toMatchObject({
      type: "websocket",
      url: "wss://example.test/socket",
      body: "websocket-message",
    });
  });

  it("containsSubstring detects leaked content in the URL, body or headers", async () => {
    expect(networkSpy.containsSubstring("user-secret")).toBe(false);

    await fetch("https://example.test/api?q=nothing-relevant", {
      method: "POST",
      body: "here goes the user-secret leaked",
    });

    expect(networkSpy.containsSubstring("user-secret")).toBe(true);
    expect(networkSpy.containsSubstring("something-else-not-present")).toBe(false);
  });

  it("containsSubstring detects leaked content in a header", async () => {
    await fetch("https://example.test/api", {
      headers: { "X-Conversation": "content-in-header" },
    });

    expect(networkSpy.containsSubstring("content-in-header")).toBe(true);
  });

  it("restore() returns fetch, XMLHttpRequest and WebSocket to their original values", () => {
    const fetchSpy = globalThis.fetch;
    const xhrSpy = globalThis.XMLHttpRequest;
    const wsSpy = globalThis.WebSocket;

    networkSpy.restore();

    expect(globalThis.fetch).not.toBe(fetchSpy);
    expect(globalThis.XMLHttpRequest).not.toBe(xhrSpy);
    expect(globalThis.WebSocket).not.toBe(wsSpy);
  });
});
