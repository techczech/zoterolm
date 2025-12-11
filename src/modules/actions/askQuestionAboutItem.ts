/**
 * Ask a question about the selected Zotero item.
 */

import { callLLM } from "../llm/service";
import { extractTextFromItem, getPDFDataFromItem, hasPDFAttachment } from "../pdf/extractor";
import { createSummary, SummaryMetadata } from "../summaries/manager";
import { showError, showQuestionDialog, showSuccess } from "../ui/dialogs";
import { getProgressTracker } from "../ui/progress";

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
    const questionPrompt =
      options.contentType === "pdf"
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

