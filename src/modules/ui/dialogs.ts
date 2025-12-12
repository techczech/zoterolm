/**
 * Dialog utilities for user interactions
 *
 * Uses XUL menulist with native="true" for Zotero 8 compatibility.
 * HTML select elements have rendering issues in Zotero 8's Firefox 115+ engine.
 */

import { getPref, setPref } from "../../utils/prefs";
import { getEnabledModels } from "../llm/models";
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

// XUL namespace for native elements
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/**
 * Helper to create a placeholder cell for a menulist
 */
function createMenulistPlaceholder(id: string): any {
  return {
    tag: "div",
    id: `${id}-container`,
    namespace: "html",
    styles: {
      minWidth: "200px",
    },
  };
}

/**
 * Install a single click handler per dialog document that closes any open
 * custom dropdowns. This avoids accumulating multiple handlers when a dialog
 * contains several custom dropdowns.
 */
function ensureCustomDropdownCloseHandler(doc: Document): void {
  const key = "__zoterolmCustomDropdownCloseHandlerInstalled";
  const docAny = doc as unknown as Record<string, unknown>;
  if (docAny[key]) return;
  docAny[key] = true;

  doc.addEventListener("click", () => {
    doc
      .querySelectorAll(".custom-select-dropdown")
      .forEach((el: Element) => {
        (el as HTMLElement).style.display = "none";
      });
  });
}

/**
 * Helper to populate a container with a custom dropdown
 * (Native HTML select doesn't work in Zotero 8's XUL dialog context - SelectParent.sys.mjs breaks it)
 */
function populateMenulist(
  doc: Document,
  containerId: string,
  selectId: string,
  options: Array<{ value: string; label: string }>,
  selectedValue: string,
  onChange?: (value: string) => void,
): void {
  const container = doc.getElementById(containerId);
  if (!container) {
    return;
  }

  ensureCustomDropdownCloseHandler(doc);

  // Ensure we don't accumulate duplicate IDs/stale controls when a dialog is reopened.
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Create custom dropdown (native select broken by Firefox's SelectParent in XUL context)
  const wrapper = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLDivElement;
  wrapper.id = selectId;
  wrapper.style.cssText = "position:relative;width:100%;min-width:200px;";
  wrapper.dataset.value = selectedValue;

  // The visible button
  const button = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLDivElement;
  button.className = "custom-select-button";
  button.style.cssText =
    "padding:6px 10px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;display:flex;justify-content:space-between;align-items:center;";

  const selectedLabel =
    options.find((o) => o.value === selectedValue)?.label ||
    options[0]?.label ||
    "";
  button.innerHTML = `<span class="selected-text">${selectedLabel}</span><span style="margin-left:8px;">▼</span>`;

  // The dropdown list (hidden by default)
  const dropdown = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLDivElement;
  dropdown.className = "custom-select-dropdown";
  dropdown.style.cssText =
    "display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #ccc;border-radius:4px;max-height:200px;overflow-y:auto;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.15);";

  // Add options
  for (const opt of options) {
    const item = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    item.className = "custom-select-option";
    item.dataset.value = opt.value;
    item.textContent = opt.label;
    item.style.cssText = "padding:8px 10px;cursor:pointer;";
    if (opt.value === selectedValue) {
      item.style.background = "#e3f2fd";
    }

    // Hover effect
    item.addEventListener("mouseenter", () => {
      item.style.background = "#f0f0f0";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background =
        item.dataset.value === wrapper.dataset.value ? "#e3f2fd" : "#fff";
    });

    // Selection
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      wrapper.dataset.value = opt.value;
      const textSpan = button.querySelector(".selected-text");
      if (textSpan) textSpan.textContent = opt.label;
      dropdown.style.display = "none";
      onChange?.(opt.value);
      // Update highlight
      dropdown.querySelectorAll(".custom-select-option").forEach((el: any) => {
        el.style.background =
          el.dataset.value === opt.value ? "#e3f2fd" : "#fff";
      });
    });

    dropdown.appendChild(item);
  }

  // Toggle dropdown on button click
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display !== "none";
    dropdown.style.display = isOpen ? "none" : "block";
  });

  wrapper.appendChild(button);
  wrapper.appendChild(dropdown);
  container.appendChild(wrapper);
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
    showError(
      "ZoteroLM",
      "No models available. Please test your API connection in settings.",
    );
    return null;
  }

  // Prepare options for menulists
  const modelOptions = models.map((m) => ({
    value: m.id,
    label: `${m.name}${m.supportsVision ? " 📄" : ""}`,
  }));
  const promptOptions =
    prompts.length > 0
      ? prompts.map((p) => ({ value: p.id, label: p.name }))
      : [{ value: "", label: "No prompts available" }];
  const contentOptions = [
    { value: "text", label: "Extracted text (fastest)" },
    { value: "pdf", label: "Full PDF (vision models only)" },
    { value: "html", label: "HTML format" },
  ];

  const initialModelId = currentModel || models[0].id;
  const initialPromptId = currentPromptId || prompts[0]?.id || "";
  const initialContentType = "text";

  const dialogData: { [key: string]: any } = {
    modelId: initialModelId,
    promptId: initialPromptId,
    contentType: initialContentType,
    confirmed: false,
    beforeUnloadCallback: () => {
      const doc = dialogHelper.window?.document;
      if (!doc) return;

      // Read values from custom dropdowns before dialog closes
      const modelSelect = doc.getElementById("model-select") as HTMLDivElement;
      const promptSelect = doc.getElementById(
        "prompt-select",
      ) as HTMLDivElement;
      const contentSelect = doc.getElementById(
        "content-select",
      ) as HTMLDivElement;

      if (modelSelect?.dataset.value)
        dialogData.modelId = modelSelect.dataset.value;
      if (promptSelect?.dataset.value)
        dialogData.promptId = promptSelect.dataset.value;
      if (contentSelect?.dataset.value)
        dialogData.contentType = contentSelect.dataset.value;
    },
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
    .addCell(1, 1, createMenulistPlaceholder("model"))
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Prompt:" },
    })
    .addCell(2, 1, createMenulistPlaceholder("prompt"))
    .addCell(3, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Content:" },
    })
    .addCell(3, 1, createMenulistPlaceholder("content"))
    .addCell(4, 0, {
      tag: "p",
      styles: { fontSize: "0.85em", color: "#666" },
      properties: {
        innerHTML: "📄 = supports PDF input. Check sidebar for progress.",
      },
    })
    .addButton("Summarize", "confirm", {
      callback: () => {
        // Capture current dropdown values immediately (some environments don't
        // reliably run unload callbacks on confirm).
        try {
          dialogData.beforeUnloadCallback?.();
        } catch {
          // ignore
        }
        dialogData.confirmed = true;
      },
    })
    .addButton("Cancel", "cancel")
    .setDialogData(dialogData)
    .open("ZoteroLM - Summarize");

  // Populate dropdowns after dialog opens (small delay to ensure DOM is ready)
  setTimeout(() => {
    const doc = dialogHelper.window?.document;
    if (doc) {
      populateMenulist(
        doc,
        "model-container",
        "model-select",
        modelOptions,
        initialModelId,
        (value) => {
          dialogData.modelId = value;
        },
      );
      populateMenulist(
        doc,
        "prompt-container",
        "prompt-select",
        promptOptions,
        initialPromptId,
        (value) => {
          dialogData.promptId = value;
        },
      );
      populateMenulist(
        doc,
        "content-container",
        "content-select",
        contentOptions,
        initialContentType,
        (value) => {
          dialogData.contentType = value;
        },
      );
    }
  }, 50);

  await dialogData.unloadLock?.promise;

  if (!dialogData.confirmed) {
    return null;
  }

  // Persist prompt selection as default for next run / toolbar / prefs.
  if (dialogData.promptId) {
    setPref("defaultPromptId", dialogData.promptId);
  }

  // Validate content type vs model
  if (dialogData.contentType === "pdf") {
    const model = models.find((m) => m.id === dialogData.modelId);
    if (model && !model.supportsVision) {
      showError(
        "ZoteroLM",
        `Model "${model.name}" does not support PDF input. Please use text extraction or choose a vision model.`,
      );
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
    showError(
      "ZoteroLM",
      "No models available. Please test your API connection in settings.",
    );
    return null;
  }

  // Prepare options for menulists
  const modelOptions = models.map((m) => ({
    value: m.id,
    label: `${m.name}${m.supportsVision ? " 📄" : ""}`,
  }));
  const contentOptions = [
    { value: "text", label: "Extracted text" },
    { value: "pdf", label: "Full PDF (vision models)" },
  ];

  const initialModelId = currentModel || models[0].id;
  const initialContentType = "text";

  const dialogData: { [key: string]: any } = {
    modelId: initialModelId,
    question: "",
    contentType: initialContentType,
    confirmed: false,
    beforeUnloadCallback: () => {
      const doc = dialogHelper.window?.document;
      if (!doc) return;

      const modelSelect = doc.getElementById("model-select") as HTMLDivElement;
      const contentSelect = doc.getElementById(
        "content-select",
      ) as HTMLDivElement;

      if (modelSelect?.dataset.value)
        dialogData.modelId = modelSelect.dataset.value;
      if (contentSelect?.dataset.value)
        dialogData.contentType = contentSelect.dataset.value;
    },
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
    .addCell(1, 1, createMenulistPlaceholder("model"))
    .addCell(2, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Content:" },
    })
    .addCell(2, 1, createMenulistPlaceholder("content"))
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

  // Populate menulists after dialog opens
  setTimeout(() => {
    const doc = dialogHelper.window?.document;
    if (doc) {
      populateMenulist(
        doc,
        "model-container",
        "model-select",
        modelOptions,
        initialModelId,
        (value) => {
          dialogData.modelId = value;
        },
      );
      populateMenulist(
        doc,
        "content-container",
        "content-select",
        contentOptions,
        initialContentType,
        (value) => {
          dialogData.contentType = value;
        },
      );
    }
  }, 50);

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
  // Match the known-working pattern used elsewhere in the codebase:
  // create the line, show the window, then update it via changeLine().
  const popupWin = new ztoolkit.ProgressWindow(title, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: message,
      type: "default",
      progress: 0,
    })
    .show();

  // Return an interface to update the progress
  return {
    setText: (text: string) => {
      try {
        // Access internal line via the window's changeLine method
        popupWin.changeLine({
          text,
          type: "default",
        });
      } catch (e) {
        // Ignore errors if window is closed
      }
    },
    setProgress: (progress: number) => {
      try {
        popupWin.changeLine({
          progress: Math.min(100, Math.max(0, progress)),
        });
      } catch (e) {
        // Ignore errors if window is closed
      }
    },
    close: () => {
      try {
        popupWin.close();
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
  const metaPrompt = prompts.find((p) => p.name.toLowerCase().includes("meta"));
  const defaultPromptId = metaPrompt?.id || prompts[0]?.id || "";

  if (models.length === 0) {
    showError(
      "ZoteroLM",
      "No models available. Please test your API connection in settings.",
    );
    return null;
  }

  // Prepare options for menulists
  const modelOptions = models.map((m) => ({ value: m.id, label: m.name }));
  const promptOptions =
    prompts.length > 0
      ? prompts.map((p) => ({ value: p.id, label: p.name }))
      : [{ value: "", label: "No prompts available" }];

  const initialModelId = currentModel || models[0].id;
  const initialPromptId = defaultPromptId;

  const dialogData: { [key: string]: any } = {
    modelId: initialModelId,
    promptId: initialPromptId,
    confirmed: false,
    beforeUnloadCallback: () => {
      const doc = dialogHelper.window?.document;
      if (!doc) return;

      const modelSelect = doc.getElementById("model-select") as HTMLDivElement;
      const promptSelect = doc.getElementById(
        "prompt-select",
      ) as HTMLDivElement;

      if (modelSelect?.dataset.value)
        dialogData.modelId = modelSelect.dataset.value;
      if (promptSelect?.dataset.value)
        dialogData.promptId = promptSelect.dataset.value;
    },
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
    .addCell(3, 1, createMenulistPlaceholder("model"))
    .addCell(4, 0, {
      tag: "label",
      namespace: "html",
      properties: { innerHTML: "Prompt:" },
    })
    .addCell(4, 1, createMenulistPlaceholder("prompt"))
    .addButton("Generate Meta-Summary", "confirm", {
      callback: () => {
        dialogData.confirmed = true;
      },
    })
    .addButton("Cancel", "cancel")
    .setDialogData(dialogData)
    .open("ZoteroLM - Collection Summary");

  // Populate menulists after dialog opens
  setTimeout(() => {
    const doc = dialogHelper.window?.document;
    if (doc) {
      populateMenulist(
        doc,
        "model-container",
        "model-select",
        modelOptions,
        initialModelId,
        (value) => {
          dialogData.modelId = value;
        },
      );
      populateMenulist(
        doc,
        "prompt-container",
        "prompt-select",
        promptOptions,
        initialPromptId,
        (value) => {
          dialogData.promptId = value;
        },
      );
    }
  }, 50);

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
