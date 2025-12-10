/**
 * Summary storage and retrieval as child notes
 */

export const SUMMARY_TAG = "#zoterolm-summary";

export interface SummaryMetadata {
  model: string;
  prompt: string;
  date: string;
  type: "item" | "collection" | "question";
  question?: string;
}

export interface Summary {
  id: number;
  parentId: number;
  content: string;
  metadata: SummaryMetadata;
  noteId: number;
}

/**
 * Create a summary note for an item
 */
export async function createSummary(
  parentItem: Zotero.Item,
  content: string,
  metadata: SummaryMetadata,
): Promise<Summary> {
  const note = new Zotero.Item("note");
  note.parentID = parentItem.id;

  const htmlContent = formatSummaryAsHtml(content, metadata);
  note.setNote(htmlContent);
  await note.saveTx();

  // Add the summary tag
  note.addTag(SUMMARY_TAG);
  await note.saveTx();

  return {
    id: note.id,
    parentId: parentItem.id,
    content,
    metadata,
    noteId: note.id,
  };
}

/**
 * Format summary content as HTML with metadata header
 */
function formatSummaryAsHtml(
  content: string,
  metadata: SummaryMetadata,
): string {
  const metaHeader = `<div style="background: #f0f0f0; padding: 8px; margin-bottom: 12px; border-radius: 4px; font-size: 0.9em;">
<strong>ZoteroLM Summary</strong><br>
Model: ${escapeHtml(metadata.model)}<br>
Prompt: ${escapeHtml(metadata.prompt)}<br>
Date: ${escapeHtml(metadata.date)}<br>
Type: ${escapeHtml(metadata.type)}${metadata.question ? `<br>Question: ${escapeHtml(metadata.question)}` : ""}
</div>`;

  const formattedContent = escapeHtml(content)
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  return `${metaHeader}<p>${formattedContent}</p>`;
}

/**
 * Get all summaries for an item
 */
export async function getSummariesForItem(
  item: Zotero.Item,
): Promise<Summary[]> {
  const noteIds = item.getNotes();
  const summaries: Summary[] = [];

  for (const noteId of noteIds) {
    const note = await Zotero.Items.getAsync(noteId);
    if (note && note.isNote()) {
      const tags = note.getTags();
      const hasSummaryTag = tags.some((t) => t.tag === SUMMARY_TAG);
      
      if (hasSummaryTag) {
        const parsed = parseSummaryNote(note as Zotero.Item);
        if (parsed) {
          summaries.push(parsed);
        }
      }
    }
  }

  return summaries;
}

/**
 * Parse a summary note into a Summary object
 */
function parseSummaryNote(note: Zotero.Item): Summary | null {
  const noteContent = note.getNote();
  if (!noteContent) return null;

  // Extract metadata from the header
  const metadata = extractMetadata(noteContent);
  
  // Extract content (everything after the metadata div)
  const content = extractContent(noteContent);

  return {
    id: note.id,
    parentId: note.parentID || 0,
    content,
    metadata,
    noteId: note.id,
  };
}

/**
 * Extract metadata from summary note HTML
 */
function extractMetadata(html: string): SummaryMetadata {
  const defaults: SummaryMetadata = {
    model: "unknown",
    prompt: "unknown",
    date: new Date().toISOString(),
    type: "item",
  };

  const modelMatch = html.match(/Model:\s*([^<\n]+)/);
  const promptMatch = html.match(/Prompt:\s*([^<\n]+)/);
  const dateMatch = html.match(/Date:\s*([^<\n]+)/);
  const typeMatch = html.match(/Type:\s*([^<\n]+)/);
  const questionMatch = html.match(/Question:\s*([^<\n]+)/);

  return {
    model: modelMatch ? modelMatch[1].trim() : defaults.model,
    prompt: promptMatch ? promptMatch[1].trim() : defaults.prompt,
    date: dateMatch ? dateMatch[1].trim() : defaults.date,
    type: (typeMatch ? typeMatch[1].trim() : defaults.type) as SummaryMetadata["type"],
    question: questionMatch ? questionMatch[1].trim() : undefined,
  };
}

/**
 * Extract content from summary note HTML (after metadata div)
 */
function extractContent(html: string): string {
  // Remove the metadata div
  const withoutMeta = html.replace(/<div[^>]*style="background:[^"]*"[^>]*>[\s\S]*?<\/div>/, "");
  
  // Convert HTML to plain text
  return withoutMeta
    .replace(/<\/p><p>/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

/**
 * Get the latest summary for an item
 */
export async function getLatestSummary(
  item: Zotero.Item,
): Promise<Summary | null> {
  const summaries = await getSummariesForItem(item);
  
  if (summaries.length === 0) return null;

  // Sort by date descending
  summaries.sort((a, b) => {
    const dateA = new Date(a.metadata.date).getTime();
    const dateB = new Date(b.metadata.date).getTime();
    return dateB - dateA;
  });

  return summaries[0];
}

/**
 * Check if an item has any summaries
 */
export async function hasSummary(item: Zotero.Item): Promise<boolean> {
  const summaries = await getSummariesForItem(item);
  return summaries.length > 0;
}

/**
 * Delete a summary
 */
export async function deleteSummary(summaryId: number): Promise<void> {
  const note = await Zotero.Items.getAsync(summaryId);
  if (note) {
    await note.eraseTx();
  }
}

/**
 * Get all summaries in a collection
 */
export async function getSummariesInCollection(
  collection: Zotero.Collection,
): Promise<Summary[]> {
  const items = collection.getChildItems();
  const allSummaries: Summary[] = [];

  for (const item of items) {
    if (!item.isNote() && !item.isAttachment()) {
      const summaries = await getSummariesForItem(item as Zotero.Item);
      allSummaries.push(...summaries);
    }
  }

  return allSummaries;
}

/**
 * Get summary content formatted for meta-summary
 */
export function formatSummariesForMetaSummary(summaries: Summary[]): string {
  return summaries
    .map((s, i) => `--- Summary ${i + 1} ---\n${s.content}`)
    .join("\n\n");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

