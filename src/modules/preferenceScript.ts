/**
 * Preference pane script handlers
 */

import { getAllPrompts } from "./prompts/manager";
import { getPref, setPref } from "../utils/prefs";
import { testConnection } from "./llm/service";
import { 
  getAllModels, 
  getEnabledModelIds, 
  setEnabledModelIds,
  ModelInfo,
} from "./llm/models";

export function registerPrefsScripts(win: Window): void {
  // Populate prompt dropdown
  populatePromptDropdown(win);
  // Populate model dropdown and list
  populateModelUI(win);
}

/**
 * Test Gemini API connection
 */
export async function testGeminiConnection(win: Window): Promise<void> {
  const doc = win.document;
  const statusDiv = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-gemini-status`,
  ) as HTMLElement;
  const keyInput = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-gemini-key`,
  ) as HTMLInputElement;
  
  if (!statusDiv || !keyInput) return;

  const apiKey = keyInput.value || (getPref("geminiApiKey") as string);
  
  if (!apiKey) {
    statusDiv.innerHTML = '<span style="color: red;">Please enter an API key first.</span>';
    return;
  }

  statusDiv.innerHTML = '<span style="color: blue;">Testing connection...</span>';

  try {
    const result = await testConnection("gemini", apiKey);
    
    if (result.success) {
      statusDiv.innerHTML = `<span style="color: green;">✓ ${result.message}</span>`;
      // Refresh the model UI
      populateModelUI(win);
    } else {
      statusDiv.innerHTML = `<span style="color: red;">✗ ${result.message}</span>`;
    }
  } catch (error) {
    statusDiv.innerHTML = `<span style="color: red;">✗ Error: ${(error as Error).message}</span>`;
  }
}

/**
 * Test OpenAI API connection
 */
export async function testOpenAIConnection(win: Window): Promise<void> {
  const doc = win.document;
  const statusDiv = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-openai-status`,
  ) as HTMLElement;
  const keyInput = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-openai-key`,
  ) as HTMLInputElement;
  
  if (!statusDiv || !keyInput) return;

  const apiKey = keyInput.value || (getPref("openaiApiKey") as string);
  
  if (!apiKey) {
    statusDiv.innerHTML = '<span style="color: red;">Please enter an API key first.</span>';
    return;
  }

  statusDiv.innerHTML = '<span style="color: blue;">Testing connection...</span>';

  try {
    const result = await testConnection("openai", apiKey);
    
    if (result.success) {
      statusDiv.innerHTML = `<span style="color: green;">✓ ${result.message}</span>`;
      // Refresh the model UI
      populateModelUI(win);
    } else {
      statusDiv.innerHTML = `<span style="color: red;">✗ ${result.message}</span>`;
    }
  } catch (error) {
    statusDiv.innerHTML = `<span style="color: red;">✗ Error: ${(error as Error).message}</span>`;
  }
}

/**
 * Populate the model dropdown and checkbox list
 */
function populateModelUI(win: Window): void {
  const doc = win.document;
  
  // Get all available models
  const allModels = getAllModels();
  const enabledIds = getEnabledModelIds();
  const currentModelId = getPref("defaultModel") as string;
  
  // Populate the default model dropdown
  const modelPopup = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-model-popup`,
  );
  
  if (modelPopup) {
    // Clear existing items
    while (modelPopup.firstChild) {
      modelPopup.removeChild(modelPopup.firstChild);
    }
    
    // Add models to dropdown
    for (const model of allModels) {
      const item = doc.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "menuitem",
      );
      const visionIcon = model.supportsVision ? " 📄" : "";
      item.setAttribute("label", `${model.name} (${model.provider})${visionIcon}`);
      item.setAttribute("value", model.id);
      modelPopup.appendChild(item);
    }
    
    // Set current value
    const menulist = modelPopup.parentElement as XUL.MenuList;
    if (menulist && currentModelId) {
      menulist.value = currentModelId;
    }
  }
  
  // Populate the model checkbox list
  const modelList = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-model-list`,
  );
  
  if (modelList) {
    // Clear existing items
    modelList.innerHTML = "";
    
    if (allModels.length === 0) {
      modelList.innerHTML = '<html:em>No models loaded. Test your API connection above.</html:em>';
      return;
    }
    
    // Group by provider
    const geminiModels = allModels.filter((m) => m.provider === "gemini");
    const openaiModels = allModels.filter((m) => m.provider === "openai");
    
    // Add Gemini models
    if (geminiModels.length > 0) {
      const geminiHeader = doc.createElementNS("http://www.w3.org/1999/xhtml", "h4") as HTMLHeadingElement;
      geminiHeader.textContent = "Google Gemini";
      geminiHeader.style.margin = "8px 0 4px 0";
      modelList.appendChild(geminiHeader);
      
      for (const model of geminiModels) {
        modelList.appendChild(createModelCheckbox(doc, model, enabledIds));
      }
    }
    
    // Add OpenAI models
    if (openaiModels.length > 0) {
      const openaiHeader = doc.createElementNS("http://www.w3.org/1999/xhtml", "h4") as HTMLHeadingElement;
      openaiHeader.textContent = "OpenAI";
      openaiHeader.style.margin = "12px 0 4px 0";
      modelList.appendChild(openaiHeader);
      
      for (const model of openaiModels) {
        modelList.appendChild(createModelCheckbox(doc, model, enabledIds));
      }
    }
  }
}

/**
 * Create a checkbox for a model
 */
function createModelCheckbox(
  doc: Document, 
  model: ModelInfo, 
  enabledIds: string[],
): HTMLElement {
  const container = doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLDivElement;
  container.style.cssText = "display: flex; align-items: center; padding: 2px 0;";
  
  const checkbox = doc.createElementNS("http://www.w3.org/1999/xhtml", "input") as HTMLInputElement;
  checkbox.setAttribute("type", "checkbox");
  checkbox.setAttribute("id", `model-${model.id}`);
  // If no models are explicitly enabled, all are enabled by default
  const isEnabled = enabledIds.length === 0 || enabledIds.includes(model.id);
  if (isEnabled) {
    checkbox.setAttribute("checked", "true");
  }
  checkbox.style.marginRight = "8px";
  
  checkbox.addEventListener("change", () => {
    updateEnabledModels(doc);
  });
  
  const label = doc.createElementNS("http://www.w3.org/1999/xhtml", "label") as HTMLLabelElement;
  label.setAttribute("for", `model-${model.id}`);
  const visionIcon = model.supportsVision ? " 📄" : "";
  const contextInfo = `${Math.round(model.contextWindow / 1000)}K context`;
  label.textContent = `${model.name}${visionIcon} (${contextInfo})`;
  label.style.cursor = "pointer";
  
  container.appendChild(checkbox);
  container.appendChild(label);
  
  return container;
}

/**
 * Update enabled models based on checkbox state
 */
function updateEnabledModels(doc: Document): void {
  const allModels = getAllModels();
  const enabledIds: string[] = [];
  
  for (const model of allModels) {
    const checkbox = doc.getElementById(`model-${model.id}`) as HTMLInputElement;
    if (checkbox && checkbox.checked) {
      enabledIds.push(model.id);
    }
  }
  
  // If all models are checked, store empty array (means all enabled)
  if (enabledIds.length === allModels.length) {
    setEnabledModelIds([]);
  } else {
    setEnabledModelIds(enabledIds);
  }
}

/**
 * Populate the prompt dropdown
 */
async function populatePromptDropdown(win: Window): Promise<void> {
  const doc = win.document;
  const promptPopup = doc.getElementById(
    `zotero-prefpane-${addon.data.config.addonRef}-prompt-popup`,
  );

  if (!promptPopup) return;

  // Clear existing items
  while (promptPopup.firstChild) {
    promptPopup.removeChild(promptPopup.firstChild);
  }

  const prompts = await getAllPrompts();
  const currentPromptId = getPref("defaultPromptId") as string;

  if (prompts.length === 0) {
    const noPromptsItem = doc.createElementNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      "menuitem",
    );
    noPromptsItem.setAttribute("label", "No prompts - click Create Default Prompts");
    noPromptsItem.setAttribute("disabled", "true");
    promptPopup.appendChild(noPromptsItem);
  } else {
    for (const prompt of prompts) {
      const item = doc.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "menuitem",
      );
      item.setAttribute("label", prompt.name);
      item.setAttribute("value", prompt.id);
      promptPopup.appendChild(item);
    }

    // Select current prompt
    const menulist = promptPopup.parentElement as XUL.MenuList;
    if (menulist && currentPromptId) {
      menulist.value = currentPromptId;
    }
  }
}
