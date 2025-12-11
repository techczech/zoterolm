/**
 * Create a meta-summary for a selected collection based on existing summaries.
 */

import { callLLM } from "../llm/service";
import { applyPrompt, getDefaultPrompt, getPromptById } from "../prompts/manager";
import { fitSummariesInContext, calculateFitCapacity } from "../summaries/fitter";
import { formatSummariesForMetaSummary, getSummariesInCollection } from "../summaries/manager";
import { showCollectionSummaryDialog, showError, showSuccess } from "../ui/dialogs";
import { getProgressTracker } from "../ui/progress";
import { escapeHtml } from "../../utils/html";

/**
 * Summarize a collection (meta-summary of existing summaries)
 */
export async function summarizeCollection(): Promise<void> {
  const tracker = getProgressTracker();
  tracker.reset();

  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const collection = ZoteroPane.getSelectedCollection();

  if (!collection) {
    showError("ZoteroLM", "No collection selected");
    return;
  }

  tracker.setStage("preparing", `Preparing collection: ${collection.name}`);
  tracker.log("info", `Collection: ${collection.name}`);

  const items = collection.getChildItems();
  const regularItems = items.filter((i) => !i.isNote() && !i.isAttachment());

  if (regularItems.length === 0) {
    showError("ZoteroLM", "Collection has no items");
    return;
  }

  tracker.log("info", `Found ${regularItems.length} items in collection`);

  // Get existing summaries
  tracker.setStage("extracting", "Loading existing summaries...");
  const summaries = await getSummariesInCollection(collection);

  if (summaries.length === 0) {
    showError(
      "ZoteroLM",
      "No summaries found in collection. Please summarize individual items first.",
    );
    tracker.setError("No summaries found in collection");
    return;
  }

  tracker.log("info", `Found ${summaries.length} existing summaries`);

  // Get default prompt for fit calculation
  const defaultPrompt = await getDefaultPrompt();
  const promptText = defaultPrompt?.content || "";

  // Calculate fit capacity
  const fitCapacity = calculateFitCapacity(summaries, promptText);
  tracker.log(
    "info",
    `Context fit: ${fitCapacity.canFit} of ${summaries.length} summaries`,
  );

  // Show dialog with fit preview
  const options = await showCollectionSummaryDialog(
    regularItems.length,
    summaries.length,
    fitCapacity.canFit,
  );

  if (!options) {
    tracker.reset();
    return;
  }

  const prompt = await getPromptById(options.promptId);
  if (!prompt) {
    showError("ZoteroLM", "Selected prompt not found");
    tracker.setError("Selected prompt not found");
    return;
  }

  tracker.log("info", `Model: ${options.modelId}, Prompt: ${prompt.name}`);

  try {
    // Fit summaries into context window
    tracker.setStage("processing", "Fitting summaries to context window...");
    const fitResult = fitSummariesInContext(
      summaries,
      prompt.content,
      options.modelId,
    );

    if (fitResult.included.length === 0) {
      throw new Error("No summaries fit in context window");
    }

    tracker.log(
      "info",
      `Including ${fitResult.included.length} of ${summaries.length} summaries`,
    );

    // Format summaries for meta-summary
    const summaryContent = formatSummariesForMetaSummary(fitResult.included);

    // Apply prompt
    const fullPromptText = applyPrompt(prompt, summaryContent);

    tracker.setStage("calling_api", "Calling LLM API...");
    tracker.setStage("waiting", "Waiting for response...");

    // Call LLM
    const response = await callLLM({
      prompt: fullPromptText,
      content: "",
      modelId: options.modelId,
    });

    tracker.setStage("receiving", "Receiving response...");
    tracker.log("info", `Received ${response.text.length} characters`);

    // Create a standalone note in the collection for the meta-summary
    tracker.setStage("saving", "Saving collection summary...");
    const note = new Zotero.Item("note");

    const htmlContent = `<div style="background: #e0e0ff; padding: 8px; margin-bottom: 12px; border-radius: 4px;">
<strong>ZoteroLM Collection Summary</strong><br>
Collection: ${escapeHtml(collection.name)}<br>
Model: ${escapeHtml(response.modelId)}<br>
Prompt: ${escapeHtml(prompt.name)}<br>
Date: ${new Date().toISOString()}<br>
Summaries included: ${fitResult.included.length} of ${summaries.length}
</div>
<div>${escapeHtml(response.text).replace(/\\n/g, "<br>")}</div>`;

    note.setNote(htmlContent);
    note.addToCollection(collection.id);
    await note.saveTx();

    tracker.setStage("complete", "Collection summary created");
    showSuccess("ZoteroLM", "Collection summary created");
  } catch (error) {
    const errorMsg = (error as Error).message;
    tracker.setError(errorMsg);
    showError("ZoteroLM", `Error: ${errorMsg}`);
  }
}

