/**
 * Reader pane section for in-reader LLM actions (Zotero 8+ reader tab).
 *
 * For now this is intentionally minimal: it proves we can (a) render in the
 * reader tab and (b) access the active ReaderInstance + selected annotation text.
 */

import { getLocaleID } from "../../utils/locale";
import { refreshSelection } from "./readerPane/selectionUI";
import { generateOutlineFromCurrentItem, renderOutline } from "./readerPane/outlineUI";
import {
  renderTagSuggestions,
  suggestTagsFromCurrentItem,
  toggleAutoTagAndRerender,
} from "./readerPane/autotagUI";
import { askFromSelection, initQAState, saveLastAnswer } from "./readerPane/qaUI";
import {
  renderSectionSummaryUI,
  summarizeSelectedSection,
} from "./readerPane/sectionSummaryUI";
import {
  generateGlossaryFromCurrentItem,
  renderGlossary,
} from "./readerPane/glossaryUI";

export function registerReaderPaneSection(): void {
  Zotero.ItemPaneManager.registerSection({
    paneID: "zoterolm-reader",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("item-section-summary-head-text"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    sidenav: {
      l10nID: getLocaleID("item-section-summary-sidenav-tooltip"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
    },
    bodyXHTML: `
      <html:div id="zoterolm-reader-container" style="padding: 8px;">
        <html:div style="margin-bottom: 8px;">
          <html:strong>Reader selection</html:strong>
        </html:div>
        <html:pre id="zoterolm-reader-selection" style="white-space: pre-wrap; background: #f5f5f5; padding: 8px; border-radius: 4px; max-height: 140px; overflow: auto;"></html:pre>
        <html:div style="margin-top: 8px;">
          <html:button id="zoterolm-reader-refresh" style="padding: 6px 12px; cursor: pointer;">Refresh selection</html:button>
        </html:div>

        <html:hr style="margin: 12px 0;"/>

        <html:div style="margin-bottom: 8px;">
          <html:strong>Outline</html:strong>
        </html:div>
        <html:div>
          <html:button id="zoterolm-reader-generate-outline" style="padding: 6px 12px; cursor: pointer;">Generate outline</html:button>
        </html:div>
        <html:div id="zoterolm-reader-outline" style="margin-top: 8px;"></html:div>

        <html:hr style="margin: 12px 0;"/>

        <html:div style="margin-bottom: 8px;">
          <html:strong>Auto-tag suggestions</html:strong>
        </html:div>
        <html:div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <html:button id="zoterolm-reader-autotag-toggle" style="padding: 6px 12px; cursor: pointer;"></html:button>
          <html:button id="zoterolm-reader-suggest-tags" style="padding: 6px 12px; cursor: pointer;">Suggest tags (most recent)</html:button>
        </html:div>
        <html:div id="zoterolm-reader-tag-suggestions" style="margin-top: 8px;"></html:div>

        <html:hr style="margin: 12px 0;"/>

        <html:div style="margin-bottom: 8px;">
          <html:strong>Ask about selection</html:strong>
        </html:div>
        <html:input id="zoterolm-reader-question" style="width: 100%; padding: 6px; margin-bottom: 8px;" placeholder="Type a question…" />
        <html:div style="display:flex; gap: 8px; flex-wrap: wrap;">
          <html:button id="zoterolm-reader-ask" style="padding: 6px 12px; cursor: pointer;">Ask</html:button>
          <html:button id="zoterolm-reader-save-answer" style="padding: 6px 12px; cursor: pointer;" disabled="true">Save as note</html:button>
        </html:div>
        <html:pre id="zoterolm-reader-answer" style="margin-top: 8px; white-space: pre-wrap; background: #f5f5f5; padding: 8px; border-radius: 4px; max-height: 200px; overflow: auto;"></html:pre>

        <html:hr style="margin: 12px 0;"/>

        <html:div style="margin-bottom: 8px;">
          <html:strong>Section summary</html:strong>
        </html:div>
        <html:div style="display:flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <html:select id="zoterolm-reader-section-select" style="flex: 1; min-width: 220px; padding: 6px;"></html:select>
          <html:button id="zoterolm-reader-summarize-section" style="padding: 6px 12px; cursor: pointer;">Summarize</html:button>
        </html:div>
        <html:pre id="zoterolm-reader-section-summary" style="margin-top: 8px; white-space: pre-wrap; background: #f5f5f5; padding: 8px; border-radius: 4px; max-height: 200px; overflow: auto;"></html:pre>

        <html:hr style="margin: 12px 0;"/>

        <html:div style="margin-bottom: 8px;">
          <html:strong>Glossary</html:strong>
        </html:div>
        <html:div>
          <html:button id="zoterolm-reader-generate-glossary" style="padding: 6px 12px; cursor: pointer;">Generate glossary</html:button>
        </html:div>
        <html:div id="zoterolm-reader-glossary" style="margin-top: 8px;"></html:div>
      </html:div>
    `,
    onInit: ({ body }) => {
      const refreshBtn = body.querySelector(
        "#zoterolm-reader-refresh",
      ) as HTMLButtonElement | null;

      refreshBtn?.addEventListener("click", () => {
        void refreshSelection(body);
      });

      const outlineBtn = body.querySelector(
        "#zoterolm-reader-generate-outline",
      ) as HTMLButtonElement | null;
      outlineBtn?.addEventListener("click", () => {
        void generateOutlineFromCurrentItem(body);
      });

      const toggleBtn = body.querySelector(
        "#zoterolm-reader-autotag-toggle",
      ) as HTMLButtonElement | null;
      toggleBtn?.addEventListener("click", () => {
        toggleAutoTagAndRerender(body);
      });

      const suggestBtn = body.querySelector(
        "#zoterolm-reader-suggest-tags",
      ) as HTMLButtonElement | null;
      suggestBtn?.addEventListener("click", () => {
        void suggestTagsFromCurrentItem(body);
      });

      const askBtn = body.querySelector(
        "#zoterolm-reader-ask",
      ) as HTMLButtonElement | null;
      askBtn?.addEventListener("click", () => {
        void askFromSelection(body);
      });

      const saveBtn = body.querySelector(
        "#zoterolm-reader-save-answer",
      ) as HTMLButtonElement | null;
      saveBtn?.addEventListener("click", () => {
        void saveLastAnswer(body);
      });

      const summarizeSectionBtn = body.querySelector(
        "#zoterolm-reader-summarize-section",
      ) as HTMLButtonElement | null;
      summarizeSectionBtn?.addEventListener("click", () => {
        void summarizeSelectedSection(body);
      });

      const sectionSelect = body.querySelector(
        "#zoterolm-reader-section-select",
      ) as HTMLSelectElement | null;
      sectionSelect?.addEventListener("change", () => {
        void renderSectionSummaryUI(body);
      });

      const glossaryBtn = body.querySelector(
        "#zoterolm-reader-generate-glossary",
      ) as HTMLButtonElement | null;
      glossaryBtn?.addEventListener("click", () => {
        void generateGlossaryFromCurrentItem(body);
      });
    },
    onItemChange: ({ item, setEnabled, tabType }) => {
      // Only enable in reader tab. The item may be an attachment or a parent item,
      // depending on Zotero’s internal selection state.
      const enabled = Boolean(item) && tabType === "reader";
      setEnabled(enabled);
      return true;
    },
    onRender: ({ setSectionSummary, body }) => {
      // Render quickly; do async work in onAsyncRender.
      setSectionSummary("Reader");
      const selection = body.querySelector(
        "#zoterolm-reader-selection",
      ) as HTMLElement | null;
      if (selection) selection.textContent = "Loading…";
    },
    onAsyncRender: async ({ body }) => {
      await refreshSelection(body);
      await renderOutline(body);
      await renderTagSuggestions(body);
      initQAState(body);
      await renderSectionSummaryUI(body);
      await renderGlossary(body);
    },
  });
}

export function unregisterReaderPaneSection(): void {
  Zotero.ItemPaneManager.unregisterSection("zoterolm-reader");
}
