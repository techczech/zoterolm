/**
 * Lifecycle hooks for ZoteroLM plugin
 */

import { getString, initLocale } from "./utils/locale";
import { 
  registerPrefsScripts, 
  testGeminiConnection, 
  testOpenAIConnection,
} from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import {
  registerItemContextMenu,
  registerCollectionContextMenu,
} from "./modules/ui/menu";
import { registerToolbarButton, unregisterToolbarButton } from "./modules/ui/toolbar";
import { registerItemPaneSection, unregisterItemPaneSection } from "./modules/ui/sidebar";
import {
  summarizeSelectedItems,
  askQuestionAboutItem,
  regenerateSummary,
  summarizeCollection,
  initializeDefaultPrompts,
  viewFullSummary,
} from "./modules/actions";
import { createDefaultPrompts } from "./modules/prompts/manager";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Register preferences pane
  registerPrefs();

  // Register notifier for item changes
  registerNotifier();

  // Register item pane section
  registerItemPaneSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Initialize default prompts if needed
  await initializeDefaultPrompts();

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  // Register context menus
  registerItemContextMenu();
  registerCollectionContextMenu();

  popupWin.changeLine({
    progress: 50,
    text: `[50%] ${getString("startup-begin")}`,
  });

  // Register toolbar button
  registerToolbarButton(win);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(3000);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  unregisterToolbarButton(win);
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  unregisterItemPaneSection();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

function registerPrefs() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

function registerNotifier() {
  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: number[] | string[],
      extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) {
        unregisterNotifier(notifierID);
        return;
      }
      addon.hooks.onNotify(event, type, ids, extraData);
    },
  };

  const notifierID = Zotero.Notifier.registerObserver(callback, [
    "item",
    "collection",
  ]);

  Zotero.Plugins.addObserver({
    shutdown: ({ id }) => {
      if (id === addon.data.config.addonID) unregisterNotifier(notifierID);
    },
  });
}

function unregisterNotifier(notifierID: string) {
  Zotero.Notifier.unregisterObserver(notifierID);
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    case "createDefaultPrompts":
      await createDefaultPrompts();
      // Refresh the preferences window
      registerPrefsScripts(data.window);
      new ztoolkit.ProgressWindow("ZoteroLM")
        .createLine({
          text: "Default prompts created",
          type: "success",
        })
        .show();
      break;
    case "testGemini":
      await testGeminiConnection(data.window);
      break;
    case "testOpenAI":
      await testOpenAIConnection(data.window);
      break;
    default:
      return;
  }
}

async function onMenuEvent(type: string) {
  switch (type) {
    case "summarize":
      await summarizeSelectedItems();
      break;
    case "askQuestion":
      await askQuestionAboutItem();
      break;
    case "regenerate":
      await regenerateSummary();
      break;
    case "summarizeCollection":
      await summarizeCollection();
      break;
    default:
      break;
  }
}

function onViewFullSummary(noteId: number) {
  viewFullSummary(noteId);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onMenuEvent,
  onViewFullSummary,
};
