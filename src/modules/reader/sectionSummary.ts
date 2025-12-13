/**
 * Section summaries, keyed by outline entry page range.
 *
 * v1 uses a vision-capable model by sending the full PDF and requesting a
 * summary for a page range.
 */

import { callLLM } from "../llm/service";
import { getPDFAsBase64, getFirstPDFAttachment } from "../pdf/extractor";
import { getPref } from "../../utils/prefs";

export type SectionSummary = {
  title: string;
  startPage: number;
  endPage: number;
  summary: string;
  modelId: string;
  createdAt: string;
};

const TAG = "#zoterolm-section-summaries";

export async function getCachedSectionSummaries(
  parentItem: Zotero.Item,
): Promise<SectionSummary[]> {
  const note = await findNote(parentItem);
  if (!note) return [];

  const raw = note.getNote() || "";
  const jsonMatch = raw.match(
    /<pre[^>]*id="zoterolm-section-summaries-json"[^>]*>([\s\S]*?)<\/pre>/,
  );
  if (!jsonMatch) return [];

  const text = unescapeHtml(jsonMatch[1]).trim();
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as SectionSummary[]) : [];
  } catch {
    return [];
  }
}

export async function generateAndCacheSectionSummary(
  itemOrAttachment: Zotero.Item,
  title: string,
  startPage: number,
  endPage: number,
): Promise<{ summary: SectionSummary; parentItem: Zotero.Item }> {
  const attachment = await getFirstPDFAttachment(itemOrAttachment);
  if (!attachment) throw new Error("No PDF attachment found");
  const parentItem = await getParentForAttachment(attachment);

  const pdf = await getPDFAsBase64(attachment);
  const modelId = String(getPref("defaultModel") || "");

  const prompt = buildPrompt(title, startPage, endPage);
  const response = await callLLM({
    prompt,
    content: "",
    modelId,
    contentType: "pdf",
    pdfBase64: pdf.base64,
  });

  const summary: SectionSummary = {
    title: title.trim() || "Section",
    startPage,
    endPage,
    summary: response.text,
    modelId: response.modelId,
    createdAt: new Date().toISOString(),
  };

  const existing = await getCachedSectionSummaries(parentItem);
  const filtered = existing.filter(
    (s) =>
      !(
        s.title === summary.title &&
        s.startPage === summary.startPage &&
        s.endPage === summary.endPage
      ),
  );
  await save(parentItem, [...filtered, summary]);

  return { summary, parentItem };
}

function buildPrompt(title: string, startPage: number, endPage: number): string {
  const range =
    startPage === endPage ? `page ${startPage}` : `pages ${startPage}-${endPage}`;

  return [
    "Summarize the specified section of this PDF for a reader.",
    "Be concise but informative. Use bullet points for key ideas.",
    "Do not invent content not present in the pages.",
    "",
    `Section title: ${title}`,
    `Pages: ${range}`,
  ].join("\n");
}

async function save(parentItem: Zotero.Item, summaries: SectionSummary[]): Promise<void> {
  const note = (await findNote(parentItem)) || new Zotero.Item("note");
  note.parentID = parentItem.id;
  note.setNote(formatAsHtml(summaries));
  await note.saveTx();

  if (!hasTag(note, TAG)) {
    note.addTag(TAG);
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

function formatAsHtml(summaries: SectionSummary[]): string {
  const json = escapeHtml(JSON.stringify(summaries, null, 2));
  return [
    "<h1>ZoteroLM Section Summaries</h1>",
    `<pre id="zoterolm-section-summaries-json" data-zoterolm="section-summaries" style="white-space: pre-wrap;">${json}</pre>`,
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


