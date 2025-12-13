/**
 * Auto-tagging support for PDF annotations (highlights/underlines/etc).
 *
 * This module is intentionally conservative:
 * - It generates *suggestions* and stores them, but does not auto-apply tags.
 * - Auto-tagging is gated by a runtime toggle (default off).
 */

import { callLLM } from "../llm/service";
import { getPref } from "../../utils/prefs";

export type TagSuggestion = {
  annotationId: number;
  suggestedTags: string[];
  modelId: string;
  createdAt: string;
  sourceText: string;
};

const SUGGESTIONS_TAG = "#zoterolm-tag-suggestions";
const APPLIED_TAG = "#zoterolm-autotagged";

let enabled = false;

export function isAutoTagEnabled(): boolean {
  return enabled;
}

export function setAutoTagEnabled(next: boolean): void {
  enabled = next;
}

/**
 * Handle Zotero.Notifier item events and generate tag suggestions for new/changed
 * annotation items (when enabled).
 */
export async function handleAutoTagNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
): Promise<void> {
  if (!enabled) return;
  if (type !== "item") return;
  if (event !== "add" && event !== "modify") return;

  for (const id of ids) {
    const itemId = Number(id);
    if (!Number.isFinite(itemId)) continue;
    const item = (await Zotero.Items.getAsync(itemId)) as unknown as Zotero.Item;
    if (!item) continue;

    // Best-effort: annotation items expose annotationType/annotationText.
    const annotationType = (item as any).annotationType as string | undefined;
    const annotationText = (item as any).annotationText as string | undefined;
    const annotationComment = (item as any).annotationComment as string | undefined;

    if (!annotationType) continue;
    if (!annotationText && !annotationComment) continue;

    // Skip if we've already applied tags.
    if (hasTag(item, APPLIED_TAG)) continue;

    // Only for the common cases where tags make sense.
    if (!["highlight", "underline", "text", "note"].includes(annotationType)) {
      continue;
    }

    try {
      const suggestion = await suggestTagsForAnnotation(item);
      const parent = await getParentForAnnotation(item);
      await upsertSuggestion(parent, suggestion);
    } catch (e) {
      ztoolkit.log("autotag failed", e);
    }
  }
}

export async function getSuggestionsForItem(
  parentItem: Zotero.Item,
): Promise<TagSuggestion[]> {
  const note = await findSuggestionsNote(parentItem);
  if (!note) return [];
  const raw = note.getNote() || "";
  const jsonMatch = raw.match(
    /<pre[^>]*id="zoterolm-tag-suggestions-json"[^>]*>([\s\S]*?)<\/pre>/,
  );
  if (!jsonMatch) return [];
  const text = unescapeHtml(jsonMatch[1]).trim();
  try {
    const parsed = JSON.parse(text) as any;
    return Array.isArray(parsed) ? (parsed as TagSuggestion[]) : [];
  } catch {
    return [];
  }
}

export async function applySuggestion(
  parentItem: Zotero.Item,
  annotationId: number,
): Promise<void> {
  const suggestions = await getSuggestionsForItem(parentItem);
  const s = suggestions.find((x) => x.annotationId === annotationId);
  if (!s) return;

  const ann = (await Zotero.Items.getAsync(annotationId)) as unknown as Zotero.Item;
  if (!ann) return;

  for (const tag of s.suggestedTags) {
    if (!tag) continue;
    ann.addTag(tag);
  }
  ann.addTag(APPLIED_TAG);
  await ann.saveTx();

  await removeSuggestion(parentItem, annotationId);
}

export async function ignoreSuggestion(
  parentItem: Zotero.Item,
  annotationId: number,
): Promise<void> {
  await removeSuggestion(parentItem, annotationId);
}

export async function suggestTagsForMostRecentAnnotation(
  attachmentOrItem: Zotero.Item,
): Promise<void> {
  const attachment = await getAttachmentForItemOrAttachment(attachmentOrItem);
  if (!attachment) throw new Error("No PDF attachment found");
  const parent = await getParentForAttachment(attachment);

  const annotations = attachment.getAnnotations();
  if (!annotations || annotations.length === 0) {
    throw new Error("No annotations found");
  }

  // Best-effort: the last annotation is usually the most recent.
  const ann = annotations[annotations.length - 1] as Zotero.Item;
  const suggestion = await suggestTagsForAnnotation(ann);
  await upsertSuggestion(parent, suggestion);
}

async function suggestTagsForAnnotation(annotation: Zotero.Item): Promise<TagSuggestion> {
  const modelId = String(getPref("defaultModel") || "");

  const type = String((annotation as any).annotationType || "");
  const text = String((annotation as any).annotationText || "");
  const comment = String((annotation as any).annotationComment || "");
  const pageLabel = String((annotation as any).annotationPageLabel || "");

  const sourceText = [
    `Type: ${type}`,
    pageLabel ? `Page: ${pageLabel}` : "",
    text ? `Text: ${text}` : "",
    comment ? `Note: ${comment}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "Suggest 3-8 short tags for the following Zotero PDF annotation.",
    "Return ONLY valid JSON as an array of strings, e.g. [\"tag1\",\"tag2\"].",
    "Use concise tags (1-3 words), no punctuation, no quotes inside tags.",
    "",
    sourceText,
  ].join("\n");

  const response = await callLLM({
    prompt,
    content: "",
    modelId,
    contentType: "text",
  });

  const tags = parseTagArray(response.text);
  return {
    annotationId: annotation.id,
    suggestedTags: tags,
    modelId: response.modelId,
    createdAt: new Date().toISOString(),
    sourceText,
  };
}

function parseTagArray(text: string): string[] {
  const cleaned = text.trim().replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try {
    const arr = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function upsertSuggestion(parentItem: Zotero.Item, suggestion: TagSuggestion): Promise<void> {
  const existing = await getSuggestionsForItem(parentItem);
  if (existing.some((s) => s.annotationId === suggestion.annotationId)) return;

  const next = [...existing, suggestion];
  await saveSuggestions(parentItem, next);
}

async function removeSuggestion(parentItem: Zotero.Item, annotationId: number): Promise<void> {
  const existing = await getSuggestionsForItem(parentItem);
  const next = existing.filter((s) => s.annotationId !== annotationId);
  await saveSuggestions(parentItem, next);
}

async function saveSuggestions(parentItem: Zotero.Item, suggestions: TagSuggestion[]): Promise<void> {
  const note = (await findSuggestionsNote(parentItem)) || new Zotero.Item("note");
  note.parentID = parentItem.id;
  note.setNote(formatSuggestionsAsHtml(suggestions));
  await note.saveTx();

  if (!hasTag(note, SUGGESTIONS_TAG)) {
    note.addTag(SUGGESTIONS_TAG);
    await note.saveTx();
  }
}

async function findSuggestionsNote(parentItem: Zotero.Item): Promise<Zotero.Item | null> {
  const noteIds = parentItem.getNotes();
  for (const noteId of noteIds) {
    const note = await Zotero.Items.getAsync(noteId);
    if (note && (note as Zotero.Item).isNote()) {
      if (hasTag(note as Zotero.Item, SUGGESTIONS_TAG)) return note as Zotero.Item;
    }
  }
  return null;
}

function formatSuggestionsAsHtml(suggestions: TagSuggestion[]): string {
  const json = escapeHtml(JSON.stringify(suggestions, null, 2));
  return [
    "<h1>ZoteroLM Tag Suggestions</h1>",
    `<pre id="zoterolm-tag-suggestions-json" data-zoterolm="tag-suggestions" style="white-space: pre-wrap;">${json}</pre>`,
  ].join("");
}

function hasTag(item: Zotero.Item, tag: string): boolean {
  const tags = item.getTags?.() || [];
  return tags.some((t: any) => t?.tag === tag);
}

async function getAttachmentForItemOrAttachment(item: Zotero.Item): Promise<Zotero.Item | null> {
  if (item.isAttachment()) {
    if (item.attachmentContentType === "application/pdf") return item;
    return null;
  }
  const attachmentIds = item.getAttachments();
  for (const id of attachmentIds) {
    const att = (await Zotero.Items.getAsync(id)) as unknown as Zotero.Item;
    if (att && att.isAttachment() && att.attachmentContentType === "application/pdf") {
      return att;
    }
  }
  return null;
}

async function getParentForAttachment(attachment: Zotero.Item): Promise<Zotero.Item> {
  const parentId = attachment.parentItemID;
  if (!parentId) return attachment;
  const parent = await Zotero.Items.getAsync(parentId);
  return (parent as Zotero.Item) || attachment;
}

async function getParentForAnnotation(annotationItem: Zotero.Item): Promise<Zotero.Item> {
  // Annotation items are usually children of the attachment item.
  const attachmentId = (annotationItem as any).parentItemID as number | undefined;
  if (!attachmentId) return annotationItem;
  const attachment = (await Zotero.Items.getAsync(attachmentId)) as unknown as Zotero.Item;
  if (!attachment) return annotationItem;
  return getParentForAttachment(attachment);
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


