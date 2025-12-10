/**
 * Context menu registration for items and collections
 */

import { getString } from "../../utils/locale";
import { hasPDFAttachment } from "../pdf/extractor";
import { hasSummary } from "../summaries/manager";

/**
 * Register right-click menu items for library items
 */
export function registerItemContextMenu(): void {
  const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

  // Main ZoteroLM submenu
  ztoolkit.Menu.register("item", {
    tag: "menu",
    id: "zoterolm-item-menu",
    label: getString("menupopup-label"),
    icon: menuIcon,
    children: [
      {
        tag: "menuitem",
        id: "zoterolm-summarize",
        label: getString("menuitem-summarize"),
        commandListener: async () => {
          addon.hooks.onMenuEvent("summarize");
        },
      },
      {
        tag: "menuitem",
        id: "zoterolm-ask-question",
        label: getString("menuitem-ask-question"),
        commandListener: async () => {
          addon.hooks.onMenuEvent("askQuestion");
        },
      },
      {
        tag: "menuseparator",
      },
      {
        tag: "menuitem",
        id: "zoterolm-regenerate",
        label: getString("menuitem-regenerate"),
        commandListener: async () => {
          addon.hooks.onMenuEvent("regenerate");
        },
      },
    ],
  });
}

/**
 * Register right-click menu items for collections
 */
export function registerCollectionContextMenu(): void {
  const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

  ztoolkit.Menu.register("collection", {
    tag: "menu",
    id: "zoterolm-collection-menu",
    label: getString("menupopup-label"),
    icon: menuIcon,
    children: [
      {
        tag: "menuitem",
        id: "zoterolm-summarize-collection",
        label: getString("menuitem-summarize-collection"),
        commandListener: async () => {
          addon.hooks.onMenuEvent("summarizeCollection");
        },
      },
    ],
  });
}

/**
 * Update menu item states based on selection
 */
export async function updateMenuStates(): Promise<void> {
  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const selectedItems = ZoteroPane.getSelectedItems();

  if (selectedItems.length === 0) {
    return;
  }

  const item = selectedItems[0];
  
  // Check if item has PDF attachment
  const hasPdf = await hasPDFAttachment(item);
  
  // Check if item already has a summary
  const hasExistingSummary = await hasSummary(item);

  // Update menu item visibility/enabled state
  const summarizeItem = ztoolkit
    .getGlobal("document")
    .getElementById("zoterolm-summarize");
  const regenerateItem = ztoolkit
    .getGlobal("document")
    .getElementById("zoterolm-regenerate");

  if (summarizeItem) {
    (summarizeItem as XUL.MenuItem).disabled = !hasPdf;
  }

  if (regenerateItem) {
    (regenerateItem as XUL.MenuItem).disabled = !hasExistingSummary;
  }
}

