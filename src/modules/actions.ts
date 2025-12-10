/**
 * Main action handlers for ZoteroLM
 */

import { callLLM, ContentType } from "./llm/service";
import { 
  extractTextFromItem, 
  hasPDFAttachment, 
  getPDFDataFromItem,
  textToHtml,
} from "./pdf/extractor";
import {
  getPromptById,
  getDefaultPrompt,
  applyPrompt,
  createDefaultPrompts,
} from "./prompts/manager";
import {
  createSummary,
  getSummariesInCollection,
  formatSummariesForMetaSummary,
  SummaryMetadata,
} from "./summaries/manager";
import { fitSummariesInContext, calculateFitCapacity } from "./summaries/fitter";
import {
  showSummarizeDialog,
  showQuestionDialog,
  showError,
  showSuccess,
  showCollectionSummaryDialog,
  showProgressWindow,
} from "./ui/dialogs";
import { getProgressTracker } from "./ui/progress";

/**
 * Summarize the selected item(s)
 */
export async function summarizeSelectedItems(): Promise<void> {
  const tracker = getProgressTracker();
  tracker.reset();
  
  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const selectedItems = ZoteroPane.getSelectedItems();

  if (selectedItems.length === 0) {
    showError("ZoteroLM", "No items selected");
    return;
  }

  tracker.setStage("preparing", "Preparing summarization...");
  tracker.log("info", `Selected ${selectedItems.length} item(s)`);

  // Show dialog to select model and prompt
  const options = await showSummarizeDialog();
  if (!options) {
    tracker.reset();
    return;
  }

  tracker.log("info", `Model: ${options.modelId}, Content: ${options.contentType}`);

  const prompt = await getPromptById(options.promptId);
  
  if (!prompt) {
    tracker.setError("Selected prompt not found");
    showError("ZoteroLM", "Selected prompt not found");
    return;
  }

  tracker.log("info", `Prompt: ${prompt.name}`);

  // Show a visible progress window
  const progressWin = showProgressWindow("ZoteroLM", "Starting summarization...");

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < selectedItems.length; i++) {
    const item = selectedItems[i];
    const itemTitle = item.getDisplayTitle();
    const progressBase = (i / selectedItems.length) * 100;

    tracker.setProgress(progressBase, `Processing ${i + 1}/${selectedItems.length}: ${itemTitle}`);
    tracker.log("info", `Processing: ${itemTitle}`);
    
    // Update visible progress window
    progressWin.setText(`Processing ${i + 1}/${selectedItems.length}: ${itemTitle}`);
    progressWin.setProgress(Math.round(progressBase));

    try {
      // Skip notes and attachments
      if (item.isNote() || item.isAttachment()) {
        tracker.log("info", `Skipping: ${itemTitle} (is note or attachment)`);
        skippedCount++;
        continue;
      }

      // Check for PDF attachment
      tracker.setStage("preparing", `Checking PDF attachment for: ${itemTitle}`);
      const hasPdf = await hasPDFAttachment(item);
      
      if (!hasPdf) {
        tracker.log("warn", `Skipping: ${itemTitle} (no PDF attachment)`);
        skippedCount++;
        continue;
      }

      let content = "";
      let pdfBase64: string | undefined;

      // Extract or encode content based on type
      if (options.contentType === "pdf") {
        tracker.setStage("encoding", `Encoding PDF: ${itemTitle}`);
        tracker.log("info", "Encoding PDF as base64...");
        progressWin.setText("Encoding PDF...");
        const pdfData = await getPDFDataFromItem(item);
        pdfBase64 = pdfData.base64;
        tracker.log("info", `PDF size: ${(pdfData.sizeBytes / 1024).toFixed(1)} KB`);
      } else {
        tracker.setStage("extracting", `Extracting text: ${itemTitle}`);
        tracker.log("info", "Extracting text from PDF...");
        
        const extraction = await extractTextFromItem(item);
        
        if (options.contentType === "html") {
          content = textToHtml(extraction.text, itemTitle);
          tracker.log("info", `Converted to HTML (${content.length} chars)`);
        } else {
          content = extraction.text;
          tracker.log("info", `Extracted ${extraction.text.length} characters`);
        }
      }

      // Apply prompt to content
      const promptText = options.contentType === "pdf" 
        ? prompt.content.replace(/\{\{content\}\}/g, "[PDF attached]")
        : applyPrompt(prompt, content);

      // Call LLM
      tracker.setStage("calling_api", `Calling LLM API...`);
      tracker.log("info", `Sending request to ${options.modelId}...`);
      progressWin.setText(`Calling ${options.modelId}...`);
      progressWin.setProgress(50);

      tracker.setStage("waiting", "Waiting for response...");
      progressWin.setText("Waiting for LLM response...");
      
      const response = await callLLM({
        prompt: promptText,
        content: options.contentType === "pdf" ? "" : content,
        modelId: options.modelId,
        contentType: options.contentType,
        pdfBase64,
      });

      tracker.setStage("receiving", "Receiving response...");
      tracker.log("info", `Received ${response.text.length} characters`);

      // Save summary as child note
      tracker.setStage("saving", `Saving summary for: ${itemTitle}`);
      const metadata: SummaryMetadata = {
        model: response.modelId,
        prompt: prompt.name,
        date: new Date().toISOString(),
        type: "item",
      };

      await createSummary(item, response.text, metadata);
      tracker.log("info", `Summary saved for: ${itemTitle}`);
      successCount++;
    } catch (error) {
      const errorMsg = (error as Error).message;
      tracker.log("error", `Error processing ${itemTitle}`, errorMsg);
      errorCount++;
    }
  }

  // Close progress window
  progressWin.close();

  // Final status
  const totalProcessed = successCount + errorCount;
  const statusMsg = `Completed: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`;
  
  if (successCount > 0) {
    tracker.setStage("complete", statusMsg);
    showSuccess("ZoteroLM", statusMsg);
  } else if (errorCount > 0) {
    tracker.setError(statusMsg);
    showError("ZoteroLM", statusMsg);
  } else {
    tracker.setStage("complete", `No items processed. ${skippedCount} skipped (no PDF attachments).`);
    showError("ZoteroLM", `No items could be processed. Make sure selected items have PDF attachments.`);
  }
}

/**
 * Ask a question about the selected item
 */
export async function askQuestionAboutItem(): Promise<void> {
  const tracker = getProgressTracker();
  tracker.reset();

  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const selectedItems = ZoteroPane.getSelectedItems();

  if (selectedItems.length === 0) {
    showError("ZoteroLM", "No items selected");
    return;
  }

  const item = selectedItems[0];
  const itemTitle = item.getDisplayTitle();

  if (item.isNote() || item.isAttachment()) {
    showError("ZoteroLM", "Please select a regular item, not a note or attachment");
    return;
  }

  tracker.setStage("preparing", "Preparing question...");
  tracker.log("info", `Item: ${itemTitle}`);

  // Check for PDF attachment
  const hasPdf = await hasPDFAttachment(item);
  if (!hasPdf) {
    showError("ZoteroLM", "Selected item has no PDF attachment");
    return;
  }

  // Show dialog to get question
  const options = await showQuestionDialog();
  if (!options) {
    tracker.reset();
    return;
  }

  tracker.log("info", `Question: ${options.question}`);
  tracker.log("info", `Model: ${options.modelId}, Content: ${options.contentType}`);

  try {
    let content = "";
    let pdfBase64: string | undefined;

    // Extract or encode content
    if (options.contentType === "pdf") {
      tracker.setStage("encoding", "Encoding PDF...");
      const pdfData = await getPDFDataFromItem(item);
      pdfBase64 = pdfData.base64;
      tracker.log("info", `PDF size: ${(pdfData.sizeBytes / 1024).toFixed(1)} KB`);
    } else {
      tracker.setStage("extracting", "Extracting text...");
      const extraction = await extractTextFromItem(item);
      content = extraction.text;
      tracker.log("info", `Extracted ${content.length} characters`);
    }

    // Create question prompt
    const questionPrompt = options.contentType === "pdf"
      ? `Please answer the following question based on the attached PDF document:\n\nQuestion: ${options.question}`
      : `Please answer the following question based on the document content:\n\nQuestion: ${options.question}\n\nDocument:\n${content}`;

    tracker.setStage("calling_api", "Calling LLM API...");
    tracker.setStage("waiting", "Waiting for response...");

    // Call LLM
    const response = await callLLM({
      prompt: questionPrompt,
      content: "",
      modelId: options.modelId,
      contentType: options.contentType,
      pdfBase64,
    });

    tracker.setStage("receiving", "Receiving response...");
    tracker.log("info", `Received ${response.text.length} characters`);

    // Save answer as child note
    tracker.setStage("saving", "Saving answer...");
    const metadata: SummaryMetadata = {
      model: response.modelId,
      prompt: "Question",
      date: new Date().toISOString(),
      type: "question",
      question: options.question,
    };

    await createSummary(item, response.text, metadata);

    tracker.setStage("complete", "Answer saved as note");
    showSuccess("ZoteroLM", "Answer saved as note");
  } catch (error) {
    const errorMsg = (error as Error).message;
    tracker.setError(errorMsg);
    showError("ZoteroLM", `Error: ${errorMsg}`);
  }
}

/**
 * Regenerate summary for the selected item
 */
export async function regenerateSummary(): Promise<void> {
  // Same as summarize, but for a single item
  await summarizeSelectedItems();
}

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
  tracker.log("info", `Context fit: ${fitCapacity.canFit} of ${summaries.length} summaries`);

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

    tracker.log("info", `Including ${fitResult.included.length} of ${summaries.length} summaries`);

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
<div>${escapeHtml(response.text).replace(/\n/g, "<br>")}</div>`;

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
