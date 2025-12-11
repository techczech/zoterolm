/**
 * Toolbar button with model/prompt selection panel
 */

import { getPref, setPref } from "../../utils/prefs";
import {
  getEnabledModels,
  getModelsForProvider,
  LLMProvider,
} from "../llm/models";
import { getAllPrompts, PromptTemplate } from "../prompts/manager";

/**
 * Register the toolbar button
 */
export function registerToolbarButton(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;

  // Create toolbar button
  const toolbarButton = ztoolkit.UI.createElement(doc, "toolbarbutton", {
    id: "zoterolm-toolbar-button",
    classList: ["zotero-tb-button"],
    attributes: {
      tooltiptext: "ZoteroLM - LLM Summarization",
      type: "menu",
    },
    styles: {
      listStyleImage: `url(chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png)`,
    },
  });

  // Create the dropdown menu
  const menuPopup = ztoolkit.UI.createElement(doc, "menupopup", {
    id: "zoterolm-toolbar-popup",
  });

  toolbarButton.appendChild(menuPopup);

  // Add to toolbar
  const toolbar = doc.getElementById("zotero-items-toolbar");
  if (toolbar) {
    toolbar.appendChild(toolbarButton);
  }

  // Populate menu when opened
  menuPopup.addEventListener("popupshowing", () => {
    populateToolbarMenu(doc, menuPopup);
  });
}

/**
 * Populate the toolbar dropdown menu
 */
async function populateToolbarMenu(
  doc: Document,
  menuPopup: XUL.MenuPopup,
): Promise<void> {
  // Clear existing items
  while (menuPopup.firstChild) {
    menuPopup.removeChild(menuPopup.firstChild);
  }

  const currentProvider = getPref("provider") as LLMProvider;
  const currentModel = getPref("defaultModel") as string;

  // Provider selection submenu
  const providerMenu = ztoolkit.UI.createElement(doc, "menu", {
    attributes: { label: "Provider" },
  });
  const providerPopup = ztoolkit.UI.createElement(doc, "menupopup", {});

  for (const provider of ["gemini", "openai"] as LLMProvider[]) {
    const item = ztoolkit.UI.createElement(doc, "menuitem", {
      attributes: {
        label: provider === "gemini" ? "Google Gemini" : "OpenAI",
        type: "radio",
        checked: String(provider === currentProvider),
      },
      listeners: [
        {
          type: "command",
          listener: () => {
            setPref("provider", provider);
            // Update model to first model of new provider
            const models = getModelsForProvider(provider);
            if (models.length > 0) {
              setPref("defaultModel", models[0].id);
            }
          },
        },
      ],
    });
    providerPopup.appendChild(item);
  }
  providerMenu.appendChild(providerPopup);
  menuPopup.appendChild(providerMenu);

  // Model selection submenu
  const modelMenu = ztoolkit.UI.createElement(doc, "menu", {
    attributes: { label: "Model" },
  });
  const modelPopup = ztoolkit.UI.createElement(doc, "menupopup", {});

  const enabledModels = getEnabledModels();

  if (enabledModels.length === 0) {
    const noModelsItem = ztoolkit.UI.createElement(doc, "menuitem", {
      attributes: {
        label: "No models - configure in settings",
        disabled: "true",
      },
    });
    modelPopup.appendChild(noModelsItem);
  } else {
    for (const model of enabledModels) {
      const visionIcon = model.supportsVision ? " 📄" : "";
      const item = ztoolkit.UI.createElement(doc, "menuitem", {
        attributes: {
          label: `${model.name}${visionIcon} (${model.provider})`,
          type: "radio",
          checked: String(model.id === currentModel),
        },
        listeners: [
          {
            type: "command",
            listener: () => {
              setPref("defaultModel", model.id);
              setPref("provider", model.provider);
            },
          },
        ],
      });
      modelPopup.appendChild(item);
    }
  }
  modelMenu.appendChild(modelPopup);
  menuPopup.appendChild(modelMenu);

  // Separator
  menuPopup.appendChild(ztoolkit.UI.createElement(doc, "menuseparator", {}));

  // Prompt selection submenu
  const promptMenu = ztoolkit.UI.createElement(doc, "menu", {
    attributes: { label: "Prompt" },
  });
  const promptPopup = ztoolkit.UI.createElement(doc, "menupopup", {});

  const prompts = await getAllPrompts();
  const currentPromptId = getPref("defaultPromptId") as string;

  if (prompts.length === 0) {
    const noPromptsItem = ztoolkit.UI.createElement(doc, "menuitem", {
      attributes: {
        label: "No prompts available",
        disabled: "true",
      },
    });
    promptPopup.appendChild(noPromptsItem);
  } else {
    for (const prompt of prompts) {
      const item = ztoolkit.UI.createElement(doc, "menuitem", {
        attributes: {
          label: prompt.name,
          type: "radio",
          checked: String(prompt.id === currentPromptId),
        },
        listeners: [
          {
            type: "command",
            listener: () => {
              setPref("defaultPromptId", prompt.id);
            },
          },
        ],
      });
      promptPopup.appendChild(item);
    }
  }
  promptMenu.appendChild(promptPopup);
  menuPopup.appendChild(promptMenu);

  // Separator
  menuPopup.appendChild(ztoolkit.UI.createElement(doc, "menuseparator", {}));

  // Quick actions
  const summarizeItem = ztoolkit.UI.createElement(doc, "menuitem", {
    attributes: { label: "Summarize Selected" },
    listeners: [
      {
        type: "command",
        listener: () => {
          addon.hooks.onMenuEvent("summarize");
        },
      },
    ],
  });
  menuPopup.appendChild(summarizeItem);

  const askItem = ztoolkit.UI.createElement(doc, "menuitem", {
    attributes: { label: "Ask Question" },
    listeners: [
      {
        type: "command",
        listener: () => {
          addon.hooks.onMenuEvent("askQuestion");
        },
      },
    ],
  });
  menuPopup.appendChild(askItem);

  // Separator
  menuPopup.appendChild(ztoolkit.UI.createElement(doc, "menuseparator", {}));

  // Settings
  const settingsItem = ztoolkit.UI.createElement(doc, "menuitem", {
    attributes: { label: "Settings..." },
    listeners: [
      {
        type: "command",
        listener: () => {
          // Open Zotero preferences to our pane
          const win = ztoolkit.getGlobal("window");
          win.openDialog(
            "chrome://zotero/content/preferences/preferences.xhtml",
            "zotero-prefs",
            "chrome,titlebar,toolbar,centerscreen",
            { pane: addon.data.config.addonID },
          );
        },
      },
    ],
  });
  menuPopup.appendChild(settingsItem);
}

/**
 * Unregister the toolbar button
 */
export function unregisterToolbarButton(win: Window): void {
  const doc = win.document;
  const button = doc.getElementById("zoterolm-toolbar-button");
  if (button) {
    button.remove();
  }
}
