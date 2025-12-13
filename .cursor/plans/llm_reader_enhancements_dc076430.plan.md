---
name: LLM Reader Enhancements
overview: Design a Zotero 7 add-on feature set that integrates LLM assistance directly into the built-in PDF reader (AI outline/TOC, highlight auto-tagging, in-reader Q&A, section summaries, glossary index), using Zotero’s existing PDF/annotation data model and this repo’s existing LLM service layer.
todos: []
---

# LLM-assisted Zotero Reader Enhancements (Zotero 8 beta)

## Goals

- Add **in-reader** assistance (not just library-item actions) for:
- **Clickable AI Outline / TOC** (especially when the PDF has no embedded outline)
- **Auto-tagging highlights/annotations** (suggest + optionally apply)
- **In-reader Q&A on selection/highlight** with page-aware citations
- **Section summaries** + “what to read next” navigation
- **Glossary / key-term index** with jump-to-context

## What Zotero already gives us (relevant to feasibility)

- **Annotations are accessible from attachments**: this repo already calls `attachment.getAnnotations()` and reads `annotationType`, `annotationText`, `annotationComment`, `annotationPageLabel` (see [`src/modules/pdf/extractor.ts`](src/modules/pdf/extractor.ts)).
- **Text extraction is available via Zotero internals**: this repo already uses `Zotero.Fulltext` cache + `Zotero.PDFWorker.getFullText()` as fallback (also in [`src/modules/pdf/extractor.ts`](src/modules/pdf/extractor.ts)).
- **UI injection patterns exist in this repo**: Item pane sections via `Zotero.ItemPaneManager.registerSection()` (see [`src/modules/ui/sidebar.ts`](src/modules/ui/sidebar.ts)), and toolbar/context menus via `ztoolkit` (see [`src/modules/ui/toolbar.ts`](src/modules/ui/toolbar.ts), [`src/modules/ui/menu.ts`](src/modules/ui/menu.ts)).

## Proposed reader improvements (feature design)

### 1) Clickable AI Outline / TOC

- **User value**: navigate long PDFs quickly; “chapter map” even for scanned/unstyled PDFs.
- **Approach**:
- **Best case**: reuse Zotero’s existing outline/TOC when the PDF has it.
- **Fallback** (no outline): generate an **AI outline** from PDF text.
- **Click-to-navigate**: each outline node links to a page (and optionally a specific anchor/highlight) using Zotero’s existing “open at location” link patterns (the same concept as “copy link to highlight”).
- **Accuracy controls**:
- Show outline with a **confidence indicator** and allow “Edit outline entry” (title/page).
- Cache generated outline per attachment + regenerate on demand.

### 2) Auto-tagging highlights/annotations

- **User value**: organize reading artifacts without manual tagging; enable later retrieval across papers.
- **Approach**:
- Detect new/changed highlights/annotations.
- Send `annotationText` + nearby context (page text slice) to LLM.
- Return **suggested tags** (and optionally: category labels like Method/Claim/Result/Definition).
- UI presents **Accept / Reject / Edit**; optionally “Auto-apply always” preference.
- **Storage**:
- Apply tags to the annotation item and/or parent item (depending on user preference).

### 3) In-reader Q&A on selection/highlight (with citations)

- **User value**: ask “what does this mean?” without leaving the reader; answers reference the page/quote.
- **Approach**:
- Reader context menu: “Ask ZoteroLM about selection/highlight”.
- Use selection text + limited surrounding context; answer is shown in a reader-side panel.
- Optional: “Save answer as note” (same summary/note pipeline you already have).

### 4) Section summaries + next-step navigation

- **User value**: summarize the current section/chapter; guide the reader to the most important next section.
- **Approach**:
- If outline exists/generated: summarize **per outline node**.
- Else: segment by heading heuristics + LLM.
- Provide actions: “Summarize this section”, “Summarize next section”, “Jump to most relevant section for my question”.

### 5) Glossary / key-term index

- **User value**: build an index for unfamiliar domain terms; jump to definitions/first mentions.
- **Approach**:
- Extract candidate terms from full text + highlights.
- Provide a list of terms with short definitions; clicking jumps to the first/most relevant occurrence.

### 6) Suggest highlights (non-destructive)

- **User value**: find potentially important passages quickly without writing anything into the PDF/annotation layer.
- **Approach**:
- Run criteria (keyword/regex and/or LLM classification) over extracted text + existing user annotations.
- Present a review list (quote + page/section) with actions like “Highlight this” / “Ignore” / “Add as note”.

## Key technical unknowns to resolve early (Zotero 7 specifics)

- **Reader integration surface**: whether we should inject UI into the reader tab via a dedicated reader API vs reuse `ItemPaneManager` with `tabType === "reader"`.
- **Selection + navigation APIs**: the most stable way to (a) get current reader selection/highlight and (b) navigate to a page/location.
- **Per-page text extraction**: whether Zotero exposes page-wise text extraction (ideal for page-accurate TOC + glossary jump).

## Implementation sketch (within this repo)

- **Reader UI module**: add a dedicated reader-side panel module (new file likely under `src/modules/ui/`), modeled after `sidebar.ts` but enabled for `tabType === "reader"` and attachment context.
- **New actions**: add action modules for:
- `generateReaderOutline`
- `autotagAnnotations`
- `askQuestionInReader`
- `summarizeSection`
- `buildGlossary`
- **Eventing**:
- Extend notifier registration in [`src/hooks.ts`](src/hooks.ts) to observe annotation-related item changes (Zotero stores annotations as items; we’ll confirm exact event/type filtering).
- **Reuse existing LLM plumbing**:
- Use `callLLM()` in [`src/modules/llm/service.ts`](src/modules/llm/service.ts).
- Add new prompt templates in [`src/modules/prompts/manager.ts`](src/modules/prompts/manager.ts) for outline/tagging/glossary/Q&A.

## UX guardrails (important for LLM-in-reader)

- Default to **suggest, don’t auto-write** (tags/outlines) until the user opts in.
- Provide **undo** for applied tags (track what changed).
- Keep context windows small to control latency/cost.
- Cache results per attachment/version and expose “Regenerate”.

## Todos

- **discover-reader-hooks**: Identify the best Zotero 7-supported way to inject a panel into the PDF reader and access current attachment/selection/navigation.
- **ai-outline-v1**: Implement AI Outline generation + caching + click-to-navigate for an attachment.
- **autotag-v1**: Detect new highlights/annotations and suggest tags with an accept/apply workflow.
- **reader-qa-v1**: Add reader context-menu Q&A on selection/highlight and display responses in the reader panel.
- **section-summary-glossary-v1**: Add section summaries and glossary index built from full text + highlights.