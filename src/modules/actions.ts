/**
 * Main action handlers for ZoteroLM
 */

export { summarizeSelectedItems } from "./actions/summarizeSelectedItems";
export { askQuestionAboutItem } from "./actions/askQuestionAboutItem";
export { summarizeCollection } from "./actions/summarizeCollection";

import { summarizeSelectedItems as summarizeSelectedItemsImpl } from "./actions/summarizeSelectedItems";
import { createDefaultPrompts } from "./prompts/manager";

/**
 * Regenerate summary for the selected item
 */
export async function regenerateSummary(): Promise<void> {
  // Same as summarize, but for a single item
  await summarizeSelectedItemsImpl();
}

/**
 * Initialize default prompts if needed
 */
export async function initializeDefaultPrompts(): Promise<void> {
  await createDefaultPrompts();
}

/**
 * View full summary note
 */
export function viewFullSummary(noteId: number): void {
  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  ZoteroPane.selectItem(noteId);
}
