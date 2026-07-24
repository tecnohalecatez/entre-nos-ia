// Markdown: minimal, dependency-free renderer for the assistant's responses.
//
// The Inference_Engine's model produces markdown-formatted text (bold,
// lists, headings, code, links). Rendering it as plain text left the raw
// syntax (`**`, `* `, etc.) visible to the user. This component parses a
// common subset of markdown directly into React elements -- never into raw
// HTML (`dangerouslySetInnerHTML` is not used anywhere here), so there's no
// injection surface, and no new dependency is introduced (kept consistent
// with the project's minimal-dependency, offline-first stance, Requirement 6).
//
// Design notes:
// - Tolerant of partial/streaming text: an unterminated `**` or a fenced
//   code block without its closing ``` is simply shown with its literal
//   characters (or, for code fences, with whatever was collected so far)
//   instead of throwing or hanging, since `partialText` grows chunk by
//   chunk while a response is being generated (see `MessageHistory.tsx`).
// - Plain text with no markdown syntax renders as a single paragraph whose
//   text content matches the input exactly, so existing text-based test
//   assertions (`MessageHistory.test.tsx`) keep working unchanged.

import type { ReactNode } from "react";
import "./Markdown.css";

type Block =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code-block"; content: string; language: string | null };

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function headingTag(level: number): (typeof HEADING_TAGS)[number] {
  const index = Math.min(Math.max(level - 1, 0), HEADING_TAGS.length - 1);
  return HEADING_TAGS[index] ?? "h6";
}

/** Splits `text` into block-level markdown elements (headings, lists, code, paragraphs). */
function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      break;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch !== null) {
      const language = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const codeLine = lines[i];
        if (codeLine === undefined || /^```\s*$/.test(codeLine)) {
          break;
        }
        codeLines.push(codeLine);
        i++;
      }
      if (i < lines.length) {
        i++; // skip the closing fence
      }
      // Tolerates a fence never closed (streaming): whatever was collected
      // so far is still shown as a code block.
      blocks.push({
        type: "code-block",
        content: codeLines.join("\n"),
        language: language !== undefined && language !== "" ? language : null,
      });
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch !== null) {
      const hashes = headingMatch[1] ?? "";
      const content = headingMatch[2] ?? "";
      blocks.push({ type: "heading", level: hashes.length, content });
      i++;
      continue;
    }

    const unorderedMatch = /^[-*+]\s+(.*)$/.exec(line);
    if (unorderedMatch !== null) {
      const items: string[] = [unorderedMatch[1] ?? ""];
      i++;
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined) {
          break;
        }
        const itemMatch = /^[-*+]\s+(.*)$/.exec(itemLine);
        if (itemMatch === null) {
          break;
        }
        items.push(itemMatch[1] ?? "");
        i++;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (orderedMatch !== null) {
      const items: string[] = [orderedMatch[1] ?? ""];
      i++;
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined) {
          break;
        }
        const itemMatch = /^\d+\.\s+(.*)$/.exec(itemLine);
        if (itemMatch === null) {
          break;
        }
        items.push(itemMatch[1] ?? "");
        i++;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    // Paragraph: consumes consecutive lines that don't start a new block,
    // preserving them joined by "\n" (shown via `white-space: pre-wrap` in
    // Markdown.css) so plain, single-line text keeps its exact content.
    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (
        nextLine === undefined ||
        nextLine.trim() === "" ||
        nextLine.startsWith("```") ||
        /^#{1,6}\s+/.test(nextLine) ||
        /^[-*+]\s+/.test(nextLine) ||
        /^\d+\.\s+/.test(nextLine)
      ) {
        break;
      }
      paragraphLines.push(nextLine);
      i++;
    }
    blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
  }

  return blocks;
}

// Matches, in priority order, inline code, bold, italic (`*`/`_`) and
// links. Bold is checked before single-`*` italic so `**bold**` isn't
// misread as two italics; a delimiter left unclosed simply fails to match
// and falls through as literal text (streaming tolerance).
const INLINE_PATTERN =
  /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;

/** Parses inline markdown (bold, italic, code, links) into React nodes. */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  INLINE_PATTERN.lastIndex = 0;

  let match = INLINE_PATTERN.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [full, code, bold, italicStar, italicUnderscore, linkText, linkUrl] = match;

    if (code !== undefined) {
      nodes.push(<code key={key++}>{code}</code>);
    } else if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>);
    } else if (italicStar !== undefined || italicUnderscore !== undefined) {
      nodes.push(<em key={key++}>{italicStar ?? italicUnderscore}</em>);
    } else if (linkText !== undefined && linkUrl !== undefined) {
      nodes.push(
        <a key={key++} href={linkUrl} target="_blank" rel="noopener noreferrer">
          {linkText}
        </a>,
      );
    }

    lastIndex = match.index + full.length;
    match = INLINE_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  // Plain text with no matches falls back to a single-element array holding
  // the original string, so the caller renders exactly one text node.
  return nodes.length > 0 ? nodes : [text];
}

export interface MarkdownProps {
  text: string;
}

/** Renders `text` (markdown produced by the Inference_Engine) as React elements. */
export function Markdown({ text }: MarkdownProps) {
  const blocks = parseBlocks(text);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="markdown">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const Tag = headingTag(block.level);
            return <Tag key={index}>{parseInline(block.content)}</Tag>;
          }
          case "unordered-list":
            return (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{parseInline(item)}</li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{parseInline(item)}</li>
                ))}
              </ol>
            );
          case "code-block":
            return (
              <pre key={index}>
                <code>{block.content}</code>
              </pre>
            );
          case "paragraph":
            return <p key={index}>{parseInline(block.content)}</p>;
        }
      })}
    </div>
  );
}
