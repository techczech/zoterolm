/**
 * Summarize selected Zotero items.
 */

import { callLLM } from "../llm/service";
import {
  extractTextFromItem,
  getPDFDataFromItem,
  hasPDFAttachment,
  textToHtml,
} from "../pdf/extractor";
import { applyPrompt, extractItemMetadata, getPromptById } from "../prompts/manager";
import { createSummary, SummaryMetadata } from "../summaries/manager";
import { showError, showProgressWindow, showSuccess, showSummarizeDialog } from "../ui/dialogs";
import { getProgressTracker } from "../ui/progress";

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

  tracker.log(
    "info",
    `Model: ${options.modelId}, Content: ${options.contentType}`,
  );

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

    tracker.setProgress(
      progressBase,
      `Processing ${i + 1}/${selectedItems.length}: ${itemTitle}`,
    );
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
        tracker.log(
          "info",
          `PDF size: ${(pdfData.sizeBytes / 1024).toFixed(1)} KB`,
        );
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
      const metadata = extractItemMetadata(item);
      const promptText =
        options.contentType === "pdf"
          ? prompt.content.replace(/\{\{content\}\}/g, "[PDF attached]")
          : applyPrompt(prompt, content, metadata);

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
      const summaryMetadata: SummaryMetadata = {
        model: response.modelId,
        prompt: prompt.name,
        date: new Date().toISOString(),
        type: "item",
      };

      await createSummary(item, response.text, summaryMetadata);
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
  const statusMsg = `Completed: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`;

  if (successCount > 0) {
    tracker.setStage("complete", statusMsg);
    showSuccess("ZoteroLM", statusMsg);
  } else if (errorCount > 0) {
    tracker.setError(statusMsg);
    showError("ZoteroLM", statusMsg);
  } else {
    tracker.setStage(
      "complete",
      `No items processed. ${skippedCount} skipped (no PDF attachments).`,
    );
    showError(
      "ZoteroLM",
      "No items could be processed. Make sure selected items have PDF attachments.",
    );
  }
}

