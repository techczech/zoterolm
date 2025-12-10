/**
 * Sidebar panel for viewing summaries, Q&A, and progress
 */

import { getLocaleID, getString } from "../../utils/locale";
import { getSummariesForItem, Summary } from "../summaries/manager";
import { getProgressTracker, ProgressState } from "./progress";

// Store references to progress elements for updates
let progressContainer: HTMLElement | null = null;
let progressUnsubscribe: (() => void) | null = null;

/**
 * Register the item pane section for summaries
 */
export function registerItemPaneSection(): void {
  Zotero.ItemPaneManager.registerSection({
    paneID: "zoterolm-summary",
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
      <html:div id="zoterolm-summary-container" style="padding: 8px;">
        <html:div id="zoterolm-progress-panel" style="display: none; margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
          <html:div style="display: flex; align-items: center; margin-bottom: 8px;">
            <html:div id="zoterolm-progress-spinner" style="width: 16px; height: 16px; border: 2px solid #007bff; border-top-color: transparent; border-radius: 50%; margin-right: 8px; animation: zoterolm-spin 1s linear infinite;"></html:div>
            <html:strong id="zoterolm-progress-stage">Ready</html:strong>
          </html:div>
          <html:div id="zoterolm-progress-bar-container" style="height: 6px; background: #e9ecef; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
            <html:div id="zoterolm-progress-bar" style="height: 100%; background: #007bff; width: 0%; transition: width 0.3s ease;"></html:div>
          </html:div>
          <html:div id="zoterolm-progress-message" style="font-size: 0.85em; color: #666;"></html:div>
          <html:details id="zoterolm-progress-logs" style="margin-top: 8px;">
            <html:summary style="cursor: pointer; font-size: 0.85em; color: #666;">Show logs</html:summary>
            <html:pre id="zoterolm-progress-log-content" style="font-size: 0.75em; max-height: 150px; overflow-y: auto; background: #fff; padding: 8px; border-radius: 4px; margin-top: 4px; white-space: pre-wrap;"></html:pre>
          </html:details>
        </html:div>
        <html:div id="zoterolm-summary-content"></html:div>
        <html:div id="zoterolm-summary-actions" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #dee2e6;">
          <html:button id="zoterolm-generate-btn" style="margin-right: 8px; padding: 6px 12px; cursor: pointer;">Generate Summary</html:button>
          <html:button id="zoterolm-ask-btn" style="padding: 6px 12px; cursor: pointer;">Ask Question</html:button>
        </html:div>
      </html:div>
      <html:style>
        @keyframes zoterolm-spin {
          to { transform: rotate(360deg); }
        }
      </html:style>
    `,
    onInit: ({ body }) => {
      const generateBtn = body.querySelector("#zoterolm-generate-btn");
      const askBtn = body.querySelector("#zoterolm-ask-btn");

      if (generateBtn) {
        generateBtn.addEventListener("click", () => {
          addon.hooks.onMenuEvent("summarize");
        });
      }

      if (askBtn) {
        askBtn.addEventListener("click", () => {
          addon.hooks.onMenuEvent("askQuestion");
        });
      }

      // Store reference to progress container
      progressContainer = body.querySelector("#zoterolm-progress-panel") as HTMLElement;
      
      // Subscribe to progress updates
      const tracker = getProgressTracker();
      progressUnsubscribe = tracker.subscribe((state) => {
        updateProgressPanel(body, state);
      });
    },
    onDestroy: () => {
      // Unsubscribe from progress updates
      if (progressUnsubscribe) {
        progressUnsubscribe();
        progressUnsubscribe = null;
      }
      progressContainer = null;
    },
    onItemChange: ({ item, setEnabled, tabType }) => {
      // Enable for regular items (not notes or attachments)
      const enabled =
        item && !item.isNote() && !item.isAttachment() && tabType !== "reader";
      setEnabled(enabled);
      return true;
    },
    onRender: ({ body, item, setSectionSummary }) => {
      const contentDiv = body.querySelector(
        "#zoterolm-summary-content",
      ) as HTMLElement;
      
      if (!contentDiv || !item) {
        setSectionSummary("No item selected");
        return;
      }

      contentDiv.innerHTML = "<em>Loading summaries...</em>";
      setSectionSummary("Loading...");
    },
    onAsyncRender: async ({ body, item, setSectionSummary }) => {
      const contentDiv = body.querySelector(
        "#zoterolm-summary-content",
      ) as HTMLElement;
      
      if (!contentDiv || !item) {
        return;
      }

      try {
        const summaries = await getSummariesForItem(item);

        if (summaries.length === 0) {
          contentDiv.innerHTML = `
            <div style="color: #666; font-style: italic;">
              No summaries yet. Click "Generate Summary" to create one.
            </div>
          `;
          setSectionSummary("No summaries");
          return;
        }

        // Sort by date, newest first
        summaries.sort((a, b) => {
          const dateA = new Date(a.metadata.date).getTime();
          const dateB = new Date(b.metadata.date).getTime();
          return dateB - dateA;
        });

        // Display summaries
        contentDiv.innerHTML = summaries
          .map((s, i) => formatSummaryHtml(s, i))
          .join("");

        setSectionSummary(`${summaries.length} summary(ies)`);
      } catch (error) {
        contentDiv.innerHTML = `
          <div style="color: red;">
            Error loading summaries: ${(error as Error).message}
          </div>
        `;
        setSectionSummary("Error");
      }
    },
    sectionButtons: [
      {
        type: "regenerate",
        icon: "chrome://zotero/skin/16/universal/sync.svg",
        l10nID: getLocaleID("item-section-summary-button-regenerate"),
        onClick: () => {
          addon.hooks.onMenuEvent("regenerate");
        },
      },
      {
        type: "ask",
        icon: "chrome://zotero/skin/16/universal/search.svg",
        l10nID: getLocaleID("item-section-summary-button-ask"),
        onClick: () => {
          addon.hooks.onMenuEvent("askQuestion");
        },
      },
    ],
  });
}

/**
 * Update the progress panel with current state
 */
function updateProgressPanel(body: HTMLElement, state: ProgressState): void {
  const panel = body.querySelector("#zoterolm-progress-panel") as HTMLElement;
  const spinner = body.querySelector("#zoterolm-progress-spinner") as HTMLElement;
  const stage = body.querySelector("#zoterolm-progress-stage") as HTMLElement;
  const bar = body.querySelector("#zoterolm-progress-bar") as HTMLElement;
  const message = body.querySelector("#zoterolm-progress-message") as HTMLElement;
  const logContent = body.querySelector("#zoterolm-progress-log-content") as HTMLElement;

  if (!panel) return;

  // Show/hide panel based on state
  if (state.stage === "idle") {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";

  // Update spinner visibility
  if (spinner) {
    spinner.style.display = state.stage === "complete" || state.stage === "error" ? "none" : "block";
  }

  // Update stage text
  if (stage) {
    stage.textContent = state.message;
    stage.style.color = state.stage === "error" ? "#dc3545" : 
                        state.stage === "complete" ? "#28a745" : "#333";
  }

  // Update progress bar
  if (bar) {
    bar.style.width = `${state.progress}%`;
    bar.style.background = state.stage === "error" ? "#dc3545" : 
                           state.stage === "complete" ? "#28a745" : "#007bff";
  }

  // Update message
  if (message) {
    message.textContent = state.details || "";
  }

  // Update logs
  if (logContent) {
    const tracker = getProgressTracker();
    logContent.textContent = tracker.getLogsAsText();
    // Auto-scroll to bottom
    logContent.scrollTop = logContent.scrollHeight;
  }
}

/**
 * Show the progress panel
 */
export function showProgressPanel(): void {
  if (progressContainer) {
    progressContainer.style.display = "block";
  }
}

/**
 * Hide the progress panel
 */
export function hideProgressPanel(): void {
  if (progressContainer) {
    progressContainer.style.display = "none";
  }
}

/**
 * Format a summary for display in the sidebar
 */
function formatSummaryHtml(summary: Summary, index: number): string {
  const date = new Date(summary.metadata.date);
  const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
  
  const typeLabel =
    summary.metadata.type === "question"
      ? `Q: ${summary.metadata.question || "Question"}`
      : summary.metadata.type === "collection"
        ? "Collection Summary"
        : "Summary";

  // Truncate content for display
  const truncatedContent =
    summary.content.length > 500
      ? summary.content.substring(0, 500) + "..."
      : summary.content;

  return `
    <div style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">
      <div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">
        <strong>${escapeHtml(typeLabel)}</strong><br>
        ${escapeHtml(summary.metadata.model)} • ${escapeHtml(summary.metadata.prompt)}<br>
        ${escapeHtml(dateStr)}
      </div>
      <div style="white-space: pre-wrap; font-size: 0.95em;">
        ${escapeHtml(truncatedContent)}
      </div>
      ${
        summary.content.length > 500
          ? `<div style="margin-top: 8px;">
              <a href="#" onclick="Zotero.ZoteroLM.hooks.onViewFullSummary(${summary.noteId}); return false;">
                View full summary
              </a>
            </div>`
          : ""
      }
    </div>
  `;
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

/**
 * Unregister the item pane section
 */
export function unregisterItemPaneSection(): void {
  if (progressUnsubscribe) {
    progressUnsubscribe();
    progressUnsubscribe = null;
  }
  Zotero.ItemPaneManager.unregisterSection("zoterolm-summary");
}
