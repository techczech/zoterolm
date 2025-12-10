/**
 * Dialog utilities for user interactions
 */

import { getPref } from "../../utils/prefs";
import { getEnabledModels, modelSupportsVision } from "../llm/models";
import { getAllPrompts, PromptTemplate } from "../prompts/manager";
import { ContentType } from "../llm/service";

export interface SummarizeOptions {
  modelId: string;
  promptId: string;
  contentType: ContentType;
}

export interface QuestionOptions {
  modelId: string;
  question: string;
  contentType: ContentType;
}

/**
 * Show a dialog to select model and prompt for summarization
 */
export async function showSummarizeDialog(): Promise<SummarizeOptions | null> {
  const prompts = await getAllPrompts();
  const models = getEnabledModels();
  const currentModel = getPref("defaultModel") as string;
  const currentPromptId = getPref("defaultPromptId") as string;

  if (models.length === 0) {
    showError("ZoteroLM", "No models available. Please test your API connection in settings.");
    return null;
  }

  const dialogData: { [key: string]: any } = {
    modelId: currentModel || models[0].id,
    promptId: currentPromptId || (prompts[0]?.id || ""),
    contentType: "text",
    confirmed: false,
  };

  const dialogHelper = new ztoolkit.Dialog(6, 2)
    .addCell(0, 0, {
      tag: "h2",
      properties: { innerHTML: "Summarize with LLM" },
    })
    .addCell(1, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Model:" },
    })
    .addCell(1, 1, {
      tag: "select",
      id: "model-select",
      namespace: "html",
      attributes: {
        "data-bind": "modelId",
        "data-prop": "value",
      },
      children: models.map((m) => ({
        tag: "option",
        namespace: "html",
        attributes: { value: m.id },
        properties: { 
          innerHTML: `${m.name}${m.supportsVision ? " 📄" : ""}`,
        },
      })),
    })
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Prompt:" },
    })
    .addCell(2, 1, {
      tag: "select",
      id: "prompt-select",
      namespace: "html",
      attributes: {
        "data-bind": "promptId",
        "data-prop": "value",
      },
      children:
        prompts.length > 0
          ? prompts.map((p) => ({
              tag: "option",
              namespace: "html",
              attributes: { value: p.id },
              properties: { innerHTML: p.name },
            }))
          : [
              {
                tag: "option",
                namespace: "html",
                attributes: { value: "", disabled: "true" },
                properties: { innerHTML: "No prompts available" },
              },
            ],
    })
    .addCell(3, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Content:" },
    })
    .addCell(3, 1, {
      tag: "select",
      id: "content-select",
      namespace: "html",
      attributes: {
        "data-bind": "contentType",
        "data-prop": "value",
      },
      children: [
        {
          tag: "option",
          namespace: "html",
          attributes: { value: "text" },
          properties: { innerHTML: "Extracted text (fastest)" },
        },
        {
          tag: "option",
          namespace: "html",
          attributes: { value: "pdf" },
          properties: { innerHTML: "Full PDF (vision models only)" },
        },
        {
          tag: "option",
          namespace: "html",
          attributes: { value: "html" },
          properties: { innerHTML: "HTML format" },
        },
      ],
    })
    .addCell(4, 0, {
      tag: "p",
      styles: { fontSize: "0.85em", color: "#666" },
      properties: {
        innerHTML:
          "📄 = supports PDF input. Check sidebar for progress.",
      },
    })
    .addButton("Summarize", "confirm", {
      callback: () => {
        dialogData.confirmed = true;
      },
    })
    .addButton("Cancel", "cancel")
    .setDialogData(dialogData)
    .open("ZoteroLM - Summarize");

  await dialogData.unloadLock?.promise;

  if (!dialogData.confirmed) {
    return null;
  }

  // Validate content type vs model
  if (dialogData.contentType === "pdf") {
    const model = models.find((m) => m.id === dialogData.modelId);
    if (model && !model.supportsVision) {
      showError("ZoteroLM", `Model "${model.name}" does not support PDF input. Please use text extraction or choose a vision model.`);
      return null;
    }
  }

  return {
    modelId: dialogData.modelId,
    promptId: dialogData.promptId,
    contentType: dialogData.contentType as ContentType,
  };
}

/**
 * Show a dialog to ask a question about an item
 */
export async function showQuestionDialog(): Promise<QuestionOptions | null> {
  const models = getEnabledModels();
  const currentModel = getPref("defaultModel") as string;

  if (models.length === 0) {
    showError("ZoteroLM", "No models available. Please test your API connection in settings.");
    return null;
  }

  const dialogData: { [key: string]: any } = {
    modelId: currentModel || models[0].id,
    question: "",
    contentType: "text",
    confirmed: false,
  };

  const dialogHelper = new ztoolkit.Dialog(6, 2)
    .addCell(0, 0, {
      tag: "h2",
      properties: { innerHTML: "Ask a Question" },
    })
    .addCell(1, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Model:" },
    })
    .addCell(1, 1, {
      tag: "select",
      id: "model-select",
      namespace: "html",
      attributes: {
        "data-bind": "modelId",
        "data-prop": "value",
      },
      children: models.map((m) => ({
        tag: "option",
        namespace: "html",
        attributes: { value: m.id },
        properties: { 
          innerHTML: `${m.name}${m.supportsVision ? " 📄" : ""}`,
        },
      })),
    })
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Content:" },
    })
    .addCell(2, 1, {
      tag: "select",
      id: "content-select",
      namespace: "html",
      attributes: {
        "data-bind": "contentType",
        "data-prop": "value",
      },
      children: [
        {
          tag: "option",
          namespace: "html",
          attributes: { value: "text" },
          properties: { innerHTML: "Extracted text" },
        },
        {
          tag: "option",
          namespace: "html",
          attributes: { value: "pdf" },
          properties: { innerHTML: "Full PDF (vision models)" },
        },
      ],
    })
    .addCell(3, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Question:" },
    })
    .addCell(3, 1, {
      tag: "textarea",
      id: "question-input",
      namespace: "html",
      attributes: {
        "data-bind": "question",
        "data-prop": "value",
        rows: "4",
        placeholder: "Enter your question about the document...",
      },
      styles: {
        width: "100%",
        minWidth: "300px",
      },
    })
    .addButton("Ask", "confirm", {
      callback: () => {
        dialogData.confirmed = true;
      },
    })
    .addButton("Cancel", "cancel")
    .setDialogData(dialogData)
    .open("ZoteroLM - Ask Question");

  await dialogData.unloadLock?.promise;

  if (!dialogData.confirmed || !dialogData.question.trim()) {
    return null;
  }

  return {
    modelId: dialogData.modelId,
    question: dialogData.question.trim(),
    contentType: dialogData.contentType as ContentType,
  };
}

/**
 * Progress window with updatable line
 */
export interface UpdatableProgressWindow {
  setText: (text: string) => void;
  setProgress: (progress: number) => void;
  close: () => void;
}

/**
 * Show a progress dialog during LLM processing
 */
export function showProgressWindow(
  title: string,
  message: string,
): UpdatableProgressWindow {
  const win = new ztoolkit.ProgressWindow(title, {
    closeOnClick: false,
    closeTime: -1,
  });
  
  // Create the line and store reference via closure
  let lineRef: ReturnType<typeof win.createLine> | null = null;
  
  win.createLine({
    text: message,
    type: "default",
    progress: 0,
  });
  
  win.show();
  
  // Return an interface to update the progress
  return {
    setText: (text: string) => {
      try {
        // Access internal line via the window's changeLine method
        win.changeLine({
          text,
          type: "default",
        });
      } catch (e) {
        // Ignore errors if window is closed
      }
    },
    setProgress: (progress: number) => {
      try {
        win.changeLine({
          progress: Math.min(100, Math.max(0, progress)),
        });
      } catch (e) {
        // Ignore errors if window is closed
      }
    },
    close: () => {
      try {
        win.close();
      } catch (e) {
        // Ignore errors
      }
    },
  };
}

/**
 * Show an error message
 */
export function showError(title: string, message: string): void {
  new ztoolkit.ProgressWindow(title, {
    closeOnClick: true,
    closeTime: 8000,
  })
    .createLine({
      text: message,
      type: "fail",
    })
    .show();
}

/**
 * Show a success message
 */
export function showSuccess(title: string, message: string): void {
  new ztoolkit.ProgressWindow(title, {
    closeOnClick: true,
    closeTime: 3000,
  })
    .createLine({
      text: message,
      type: "success",
    })
    .show();
}

/**
 * Show collection summary dialog with fit preview
 */
export async function showCollectionSummaryDialog(
  itemCount: number,
  summaryCount: number,
  canFit: number,
): Promise<SummarizeOptions | null> {
  const prompts = await getAllPrompts();
  const models = getEnabledModels();
  const currentModel = getPref("defaultModel") as string;
  
  // Find the meta-summary prompt
  const metaPrompt = prompts.find((p) =>
    p.name.toLowerCase().includes("meta"),
  );
  const defaultPromptId = metaPrompt?.id || prompts[0]?.id || "";

  if (models.length === 0) {
    showError("ZoteroLM", "No models available. Please test your API connection in settings.");
    return null;
  }

  const dialogData: { [key: string]: any } = {
    modelId: currentModel || models[0].id,
    promptId: defaultPromptId,
    confirmed: false,
  };

  const fitMessage =
    canFit < summaryCount
      ? `<span style="color: orange;">Only ${canFit} of ${summaryCount} summaries will fit in context window.</span>`
      : `<span style="color: green;">All ${summaryCount} summaries will fit.</span>`;

  const dialogHelper = new ztoolkit.Dialog(6, 2)
    .addCell(0, 0, {
      tag: "h2",
      properties: { innerHTML: "Summarize Collection" },
    })
    .addCell(1, 0, {
      tag: "p",
      properties: {
        innerHTML: `Collection has ${itemCount} items with ${summaryCount} existing summaries.`,
      },
    })
    .addCell(2, 0, {
      tag: "p",
      properties: { innerHTML: fitMessage },
    })
    .addCell(3, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Model:" },
    })
    .addCell(3, 1, {
      tag: "select",
      id: "model-select",
      namespace: "html",
      attributes: {
        "data-bind": "modelId",
        "data-prop": "value",
      },
      children: models.map((m) => ({
        tag: "option",
        namespace: "html",
        attributes: { value: m.id },
        properties: { innerHTML: `${m.name}` },
      })),
    })
    .addCell(4, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Prompt:" },
    })
    .addCell(4, 1, {
      tag: "select",
      id: "prompt-select",
      namespace: "html",
      attributes: {
        "data-bind": "promptId",
        "data-prop": "value",
      },
      children:
        prompts.length > 0
          ? prompts.map((p) => ({
              tag: "option",
              namespace: "html",
              attributes: { value: p.id },
              properties: { innerHTML: p.name },
            }))
          : [
              {
                tag: "option",
                namespace: "html",
                attributes: { value: "", disabled: "true" },
                properties: { innerHTML: "No prompts available" },
              },
            ],
    })
    .addButton("Generate Meta-Summary", "confirm", {
      callback: () => {
        dialogData.confirmed = true;
      },
    })
    .addButton("Cancel", "cancel")
    .setDialogData(dialogData)
    .open("ZoteroLM - Collection Summary");

  await dialogData.unloadLock?.promise;

  if (!dialogData.confirmed) {
    return null;
  }

  return {
    modelId: dialogData.modelId,
    promptId: dialogData.promptId,
    contentType: "text",
  };
}
