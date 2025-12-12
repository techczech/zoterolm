/**
 * Minimal Markdown -> safe HTML fragment renderer.
 *
 * - Escapes any raw HTML in input.
 * - Supports headings, paragraphs, bullet/numbered lists, and fenced code blocks.
 * - Intended for Zotero note bodies via note.setNote(htmlFragment).
 */
import { escapeHtml } from "./html";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang: string | null; lines: string[] };

function isBlank(line: string): boolean {
  return !line.trim();
}

function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Skip blank lines (they separate paragraphs/lists)
    if (isBlank(line)) {
      i++;
      continue;
    }

    // Fenced code block ```
    const fenceMatch = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] ?? null;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      // Consume closing fence if present
      if (i < lines.length && lines[i].match(/^```\s*$/)) i++;
      blocks.push({ type: "code", lang, lines: codeLines });
      continue;
    }

    // Heading #..######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)\s*$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Bullet list
    const ulMatch = line.match(/^\s*[-*+]\s+(.+)\s*$/);
    if (ulMatch) {
      const items: string[] = [ulMatch[1]];
      i++;
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(/^\s*[-*+]\s+(.+)\s*$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Numbered list
    const olMatch = line.match(/^\s*\d+\.\s+(.+)\s*$/);
    if (olMatch) {
      const items: string[] = [olMatch[1]];
      i++;
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(/^\s*\d+\.\s+(.+)\s*$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph: collect until blank line or a block-starter
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (isBlank(next)) break;
      if (next.match(/^```([A-Za-z0-9_-]+)?\s*$/)) break;
      if (next.match(/^(#{1,6})\s+(.+)\s*$/)) break;
      if (next.match(/^\s*[-*+]\s+(.+)\s*$/)) break;
      if (next.match(/^\s*\d+\.\s+(.+)\s*$/)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }

  return blocks;
}

function renderInline(text: string): string {
  const parts = text.split("`");

  const renderTextSegment = (segment: string): string => {
    let html = escapeHtml(segment);

    // Bold: **text** or __text__
    html = html
      .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^\n]+?)__/g, "<strong>$1</strong>");

    // Italic: *text* or _text_ (avoid matching bold markers)
    html = html
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");

    return html;
  };

  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i] ?? "";
    const isCode = i % 2 === 1;
    out += isCode
      ? `<code>${escapeHtml(segment)}</code>`
      : renderTextSegment(segment);
  }
  return out;
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading":
      return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`;
    case "paragraph": {
      const html = block.lines.map((l) => renderInline(l)).join("<br>");
      return `<p>${html}</p>`;
    }
    case "ul":
      return `<ul>${block.items
        .map((it) => `<li>${renderInline(it)}</li>`)
        .join("")}</ul>`;
    case "ol":
      return `<ol>${block.items
        .map((it) => `<li>${renderInline(it)}</li>`)
        .join("")}</ol>`;
    case "code": {
      const code = escapeHtml(block.lines.join("\n"));
      const classAttr = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      return `<pre><code${classAttr}>${code}</code></pre>`;
    }
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

/**
 * Render Markdown into a safe HTML fragment (no <html>/<body> wrapper).
 */
export function renderMarkdownToSafeHtmlFragment(markdown: string): string {
  const blocks = parseMarkdownToBlocks(markdown || "");
  if (blocks.length === 0) return "<p></p>";
  return blocks.map(renderBlock).join("\n");
}

