/**
 * Glossary generation for a PDF attachment.
 *
 * v1 uses extracted full text + existing annotations (highlights/notes) as input.
 */

import { callLLM } from "../llm/service";
import { extractTextFromPDF, getFirstPDFAttachment } from "../pdf/extractor";
import { getPref } from "../../utils/prefs";

export type GlossaryEntry = {
  term: string;
  definition: string;
};

export type Glossary = {
  entries: GlossaryEntry[];
  modelId: string;
  createdAt: string;
};

const TAG = "#zoterolm-glossary";

export async function getCachedGlossary(parentItem: Zotero.Item): Promise<Glossary | null> {
  const note = await findNote(parentItem);
  if (!note) return null;

  const raw = note.getNote() || "";
  const jsonMatch = raw.match(
    /<pre[^>]*id="zoterolm-glossary-json"[^>]*>([\s\S]*?)<\/pre>/,
  );
  if (!jsonMatch) return null;

  const text = unescapeHtml(jsonMatch[1]).trim();
  return safeParseGlossary(text);
}

export async function generateAndCacheGlossary(
  itemOrAttachment: Zotero.Item,
): Promise<{ glossary: Glossary; parentItem: Zotero.Item }> {
  const attachment = await getFirstPDFAttachment(itemOrAttachment);
  if (!attachment) throw new Error("No PDF attachment found");
  const parentItem = await getParentForAttachment(attachment);

  const text = await extractTextFromPDF(attachment);
  const annotations = extractAnnotationSnippets(attachment);

  const modelId = String(getPref("defaultModel") || "");
  const prompt = buildPrompt(text, annotations);

  const response = await callLLM({
    prompt,
    content: "",
    modelId,
    contentType: "text",
  });

  const glossary = parseGlossaryFromLLM(response.text, response.modelId);
  await save(parentItem, glossary);

  return { glossary, parentItem };
}

function buildPrompt(text: string, annotations: string): string {
  return [
    "Build a glossary of key terms from this document.",
    "Prefer terms that are central to understanding the paper.",
    "Use the user’s highlights/notes as signals of importance when available.",
    "",
    "Return ONLY valid JSON (no markdown, no prose).",
    "",
    "JSON schema:",
    "{",
    '  "entries": [',
    "    {",
    '      "term": "string",',
    '      "definition": "string"',
    "    }",
    "  ]",
    "}",
    "",
    "Constraints:",
    "- 10-30 entries.",
    "- Definitions 1-3 sentences.",
    "",
    annotations ? `User annotations:\n${annotations}\n` : "",
    `Document text:\n${truncate(text, 20000)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseGlossaryFromLLM(text: string, modelId: string): Glossary {
  const cleaned = stripJsonFences(text).trim();
  const parsed = safeParseGlossary(cleaned);
  if (!parsed) throw new Error("LLM did not return valid glossary JSON");
  return { ...parsed, modelId, createdAt: new Date().toISOString() };
}

function safeParseGlossary(jsonText: string): Glossary | null {
  try {
    const obj = JSON.parse(jsonText) as any;
    const entries = Array.isArray(obj?.entries) ? obj.entries : null;
    if (!entries) return null;

    const normalized: GlossaryEntry[] = [];
    for (const e of entries) {
      const term = String(e?.term || "").trim();
      const definition = String(e?.definition || "").trim();
      if (!term || !definition) continue;
      normalized.push({ term, definition });
    }
    if (normalized.length === 0) return null;

    return { entries: normalized, modelId: "unknown", createdAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

function extractAnnotationSnippets(attachment: Zotero.Item): string {
  try {
    const annotations = attachment.getAnnotations();
    if (!annotations || annotations.length === 0) return "";
    const lines: string[] = [];
    for (const ann of annotations as any[]) {
      const text = String(ann?.annotationText || "").trim();
      const comment = String(ann?.annotationComment || "").trim();
      const page = String(ann?.annotationPageLabel || "").trim();
      const snippet = [page ? `[Page ${page}]` : "", text, comment].filter(Boolean).join(" ");
      if (snippet) lines.push(snippet);
    }
    return lines.slice(0, 100).join("\n");
  } catch {
    return "";
  }
}

async function save(parentItem: Zotero.Item, glossary: Glossary): Promise<void> {
  const note = (await findNote(parentItem)) || new Zotero.Item("note");
  note.parentID = parentItem.id;
  note.setNote(formatAsHtml(glossary));
  await note.saveTx();

  if (!hasTag(note, TAG)) {
    note.addTag(TAG);
    note.addTag(glossary.modelId);
    await note.saveTx();
  }
}

async function findNote(parentItem: Zotero.Item): Promise<Zotero.Item | null> {
  const noteIds = parentItem.getNotes();
  for (const noteId of noteIds) {
    const note = await Zotero.Items.getAsync(noteId);
    if (note && (note as Zotero.Item).isNote() && hasTag(note as Zotero.Item, TAG)) {
      return note as Zotero.Item;
    }
  }
  return null;
}

function formatAsHtml(glossary: Glossary): string {
  const json = escapeHtml(JSON.stringify({ entries: glossary.entries }, null, 2));
  return [
    "<h1>ZoteroLM Glossary</h1>",
    `<div style="background:#f0f0f0; padding:8px; margin-bottom:12px; border-radius:4px; font-size:0.9em;">`,
    `<strong>ZoteroLM Glossary</strong><br>`,
    `Model: ${escapeHtml(glossary.modelId)}<br>`,
    `Date: ${escapeHtml(glossary.createdAt)}`,
    "</div>",
    `<pre id="zoterolm-glossary-json" data-zoterolm="glossary-json" style="white-space: pre-wrap;">${json}</pre>`,
  ].join("");
}

function hasTag(item: Zotero.Item, tag: string): boolean {
  const tags = item.getTags?.() || [];
  return tags.some((t: any) => t?.tag === tag);
}

async function getParentForAttachment(attachment: Zotero.Item): Promise<Zotero.Item> {
  const parentId = attachment.parentItemID;
  if (!parentId) return attachment;
  const parent = await Zotero.Items.getAsync(parentId);
  return (parent as Zotero.Item) || attachment;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n\n[truncated]";
}

function stripJsonFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
}


