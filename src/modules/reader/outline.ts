/**
 * Reader outline generation + caching.
 *
 * v1 focuses on PDF attachments and uses a vision-capable model by sending the
 * full PDF as base64 and requesting a structured outline with page numbers.
 */

import { callLLM } from "../llm/service";
import { getPDFAsBase64, getFirstPDFAttachment } from "../pdf/extractor";
import { getPref } from "../../utils/prefs";

export type OutlineEntry = {
  title: string;
  level: number;
  page: number;
};

export type Outline = {
  entries: OutlineEntry[];
  modelId: string;
  createdAt: string;
};

const OUTLINE_TAG = "#zoterolm-outline";

export async function getCachedOutline(
  parentItem: Zotero.Item,
): Promise<Outline | null> {
  const note = await findOutlineNote(parentItem);
  if (!note) return null;

  const raw = note.getNote() || "";
  const jsonMatch = raw.match(
    /<pre[^>]*id="zoterolm-outline-json"[^>]*>([\s\S]*?)<\/pre>/,
  );
  if (!jsonMatch) return null;

  const jsonText = unescapeHtml(jsonMatch[1]).trim();
  return safeParseOutline(jsonText);
}

export async function generateAndCacheOutline(
  itemOrAttachment: Zotero.Item,
): Promise<{ outline: Outline; parentItem: Zotero.Item; attachment: Zotero.Item }> {
  const attachment = await getFirstPDFAttachment(itemOrAttachment);
  if (!attachment) {
    throw new Error("No PDF attachment found");
  }

  const parentItem = await getParentForAttachment(attachment);

  const pdf = await getPDFAsBase64(attachment);
  const modelId = String(getPref("defaultModel") || "");

  const prompt = buildOutlinePrompt();
  const response = await callLLM({
    prompt,
    content: "",
    modelId,
    contentType: "pdf",
    pdfBase64: pdf.base64,
  });

  const outline = parseOutlineFromLLM(response.text, response.modelId);
  await upsertOutlineNote(parentItem, outline);

  return { outline, parentItem, attachment };
}

function buildOutlinePrompt(): string {
  return [
    "You are helping a user read a PDF in Zotero.",
    "Create a concise clickable outline (table of contents) for the PDF.",
    "",
    "Return ONLY valid JSON (no markdown, no prose).",
    "",
    "JSON schema:",
    "{",
    '  "entries": [',
    "    {",
    '      "title": "string",',
    '      "level": 1,',
    '      "page": 1',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- level is an integer >= 1 (1=top level).",
    "- page is a 1-based page number in the PDF.",
    "- Keep 10-40 entries total unless the document is very short.",
  ].join("\n");
}

function parseOutlineFromLLM(text: string, modelId: string): Outline {
  const cleaned = stripJsonFences(text).trim();
  const parsed = safeParseOutline(cleaned);
  if (!parsed) {
    throw new Error("LLM did not return valid outline JSON");
  }
  return {
    ...parsed,
    modelId,
    createdAt: new Date().toISOString(),
  };
}

function safeParseOutline(jsonText: string): Outline | null {
  try {
    const obj = JSON.parse(jsonText) as any;
    const entries = Array.isArray(obj?.entries) ? obj.entries : null;
    if (!entries) return null;

    const normalized: OutlineEntry[] = [];
    for (const e of entries) {
      const title = String(e?.title || "").trim();
      const level = Number(e?.level);
      const page = Number(e?.page);
      if (!title) continue;
      if (!Number.isFinite(level) || level < 1) continue;
      if (!Number.isFinite(page) || page < 1) continue;
      normalized.push({ title, level: Math.floor(level), page: Math.floor(page) });
    }

    if (normalized.length === 0) return null;
    return { entries: normalized, modelId: "unknown", createdAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function getParentForAttachment(attachment: Zotero.Item): Promise<Zotero.Item> {
  const parentId = attachment.parentItemID;
  if (!parentId) return attachment;
  const parent = await Zotero.Items.getAsync(parentId);
  return (parent as Zotero.Item) || attachment;
}

async function findOutlineNote(parentItem: Zotero.Item): Promise<Zotero.Item | null> {
  const noteIds = parentItem.getNotes();
  for (const noteId of noteIds) {
    const note = await Zotero.Items.getAsync(noteId);
    if (note && (note as Zotero.Item).isNote()) {
      const tags = (note as Zotero.Item).getTags();
      if (tags.some((t) => t.tag === OUTLINE_TAG)) {
        return note as Zotero.Item;
      }
    }
  }
  return null;
}

async function upsertOutlineNote(parentItem: Zotero.Item, outline: Outline): Promise<void> {
  const existing = await findOutlineNote(parentItem);
  const html = formatOutlineAsHtml(outline);

  const note = existing || new Zotero.Item("note");
  note.parentID = parentItem.id;
  note.setNote(html);
  await note.saveTx();

  if (!existing) {
    note.addTag(OUTLINE_TAG);
    note.addTag(outline.modelId);
    await note.saveTx();
  }
}

function formatOutlineAsHtml(outline: Outline): string {
  const json = escapeHtml(JSON.stringify({ entries: outline.entries }, null, 2));
  return [
    "<h1>ZoteroLM Outline</h1>",
    `<div style="background: #f0f0f0; padding: 8px; margin-bottom: 12px; border-radius: 4px; font-size: 0.9em;">`,
    `<strong>ZoteroLM Outline</strong><br>`,
    `Model: ${escapeHtml(outline.modelId)}<br>`,
    `Date: ${escapeHtml(outline.createdAt)}`,
    "</div>",
    `<pre id="zoterolm-outline-json" data-zoterolm="outline-json" style="white-space: pre-wrap;">${json}</pre>`,
  ].join("");
}

function stripJsonFences(text: string): string {
  // Remove ```json ... ``` wrappers if the model ignored instructions.
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


