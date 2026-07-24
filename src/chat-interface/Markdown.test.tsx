// Unit tests for `Markdown`: verifies the block/inline subset is parsed
// into the corresponding elements, that plain text keeps its exact text
// content (so `MessageHistory.test.tsx`'s text-based assertions keep
// working unchanged), and that partial/unterminated markdown (streaming)
// doesn't throw and degrades to literal text.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders plain text with no markdown syntax as a single paragraph with the exact same text", () => {
    const { container } = render(<Markdown text="Hola, esto es texto plano" />);

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Hola, esto es texto plano");
  });

  it("renders **bold** text as <strong>", () => {
    render(<Markdown text="esto es **importante** de verdad" />);

    const strong = screen.getByText("importante");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders *italic* and _italic_ text as <em>", () => {
    render(<Markdown text="*cursiva* y _tambien cursiva_" />);

    expect(screen.getByText("cursiva").tagName).toBe("EM");
    expect(screen.getByText("tambien cursiva").tagName).toBe("EM");
  });

  it("renders `inline code` as <code>", () => {
    render(<Markdown text="usa `npm install` para instalar" />);

    expect(screen.getByText("npm install").tagName).toBe("CODE");
  });

  it("renders a fenced code block as <pre><code>", () => {
    const { container } = render(<Markdown text={"```\nconst x = 1;\n```"} />);

    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.querySelector("code")?.textContent).toBe("const x = 1;");
  });

  it("renders an unordered list", () => {
    const { container } = render(<Markdown text={"- primero\n- segundo\n- tercero"} />);

    const items = container.querySelectorAll("ul > li");
    expect(Array.from(items).map((item) => item.textContent)).toEqual([
      "primero",
      "segundo",
      "tercero",
    ]);
  });

  it("renders an ordered list", () => {
    const { container } = render(<Markdown text={"1. uno\n2. dos"} />);

    const items = container.querySelectorAll("ol > li");
    expect(Array.from(items).map((item) => item.textContent)).toEqual(["uno", "dos"]);
  });

  it("renders a heading with the level matching its number of #", () => {
    const { container } = render(<Markdown text="## Un título" />);

    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Un título");
  });

  it("renders a [link](url) with an http scheme as an anchor opened in a new tab", () => {
    render(<Markdown text="mirá [este sitio](https://example.com)" />);

    const link = screen.getByRole("link", { name: "este sitio" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render a link with an unsupported scheme, leaving the literal text", () => {
    const { container } = render(<Markdown text="[click](javascript:alert(1))" />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("[click](javascript:alert(1))");
  });

  it("does not throw on unterminated bold (partial streaming text) and shows it literally", () => {
    const { container } = render(<Markdown text="La respuesta es **incompl" />);

    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toBe("La respuesta es **incompl");
  });

  it("does not throw on an unterminated fenced code block (partial streaming text)", () => {
    const { container } = render(<Markdown text={"```\nconst x = 1;"} />);

    const pre = container.querySelector("pre");
    expect(pre?.querySelector("code")?.textContent).toBe("const x = 1;");
  });

  it("renders nothing for empty text", () => {
    const { container } = render(<Markdown text="" />);

    expect(container.firstChild).toBeNull();
  });
});
