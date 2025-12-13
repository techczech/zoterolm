---
name: ZoteroLM Library Intelligence
overview: Produce a competitive landscape of LLM + reference-management tools and translate it into a prioritized improvement backlog for ZoteroLM, with pros/cons and concrete implementation notes mapped onto the current codebase.
todos:
  - id: landscape
    content: Write competitive landscape comparison focused on library intelligence and Zotero workflows.
    status: pending
  - id: backlog
    content: Draft prioritized improvement list (P0/P1/P2) with pros/cons and risks.
    status: pending
  - id: impl-notes
    content: Add implementation notes mapped to existing modules and likely new files, keeping changes small and non-duplicative.
    status: pending
  - id: deliverable
    content: Format final output as tables + short narrative, ready to be used as an issue roadmap.
    status: pending
---

# ZoteroLM: library-intelligence improvements plan

## What I will deliver

- **Competitive landscape summary** of tools adjacent to ZoteroLM (plugins + external “literature intelligence” apps), focusing on what they enable that ZoteroLM does not.
- **Prioritized improvement list** (P0/P1/P2) optimized for “library intelligence” (cross-item synthesis, organization, recommendation, linking), assuming **cloud LLMs are OK by default**.
- For each proposed improvement: **pros/cons**, risks, UX impact, and **implementation details** that reference the existing architecture (actions, PDF extraction, summaries, prompts, UI, and preferences).

## Inputs I’ve already reviewed

- Product scope and current features in `README.md` and `CHANGELOG.md`.
- Current implementations in:
- `src/modules/actions/summarizeSelectedItems.ts`
- `src/modules/actions/askQuestionAboutItem.ts`
- `src/modules/actions/summarizeCollection.ts`
- `src/modules/summaries/manager.ts` and `src/modules/summaries/fitter.ts`
- `src/modules/pdf/extractor.ts`
- `src/modules/prompts/manager.ts`
- `src/modules/llm/service.ts` and `src/modules/llm/models.ts`
- External tools/features (high-level) via web research: PapersGPT, BibGenie/Zotero Copilot, Zotero-GPT, Elicit, Research Rabbit, Litmaps, Connected Papers, Inciteful, Semantic Scholar, Scite, ReadNext, Better Notes.

## Competitive landscape (what I will compare)

- **Zotero plugins (LLM-in-Zotero)**
- PapersGPT: multi-PDF chat, model switching, “chat UX” emphasis.
- BibGenie/Zotero Copilot: reading assistance + “connect ideas” messaging.
- Zotero-GPT: library queries + prompt/command workflows.
- **External literature intelligence**
- Elicit: structured extraction tables + BibTeX/RIS export + Zotero connection.
- Research Rabbit / Litmaps / Connected Papers / Inciteful: discovery + mapping + recommendation.
- Semantic Scholar / Scite: paper summaries, influential citations, citation context.
- ReadNext: personalized recommendations seeded from Zotero focus collections.
- Better Notes: note linking and graph (non-LLM) but overlaps with “library intelligence”.

## Improvement backlog structure

I’ll propose improvements grouped by outcome:

1. **Cross-item synthesis and retrieval** (make ZoteroLM feel like a “library brain”)
2. **Organization and tagging** (turn LLM output into actionable structure)
3. **Discovery / recommendations** (bring new relevant papers in)
4. **Trust, citations, traceability** (avoid “nice but ungrounded” outputs)

Each item will include:

- **Priority**: P0 (highest ROI/lowest risk), P1, P2
- **User value** and UX surface (context menu, sidebar, dialog additions)
- **Pros/cons** and failure modes
- **Implementation notes**: which existing modules to extend and what new modules would be introduced

## Proposed high-level priorities (draft)

### P0: “Library intelligence without new infra”

- **P0.1 — Cross-item Q&A over existing summaries**
- Extend collection meta-summary flow into “Ask a question about this collection (using summaries)”.
- Leverage: `getSummariesInCollection()`, `fitSummariesInContext()`, `callLLM()`.
- Adds immediate “library brain” value without embeddings/indexing.

- **P0.2 — Structured outputs in notes (machine-readable)**
- Save LLM outputs in a consistent, parseable format (e.g., fenced JSON block or tagged HTML markers) alongside rendered Markdown.
- Leverage: summary HTML markers already used in `src/modules/summaries/manager.ts`.
- Enables later features (auto-tagging, relationship extraction) without re-processing old outputs.

- **P0.3 — Automatic “Connections” section generation**
- For an item, generate: related items in library (by shared tags/authors/keywords) + an LLM-written “how this relates” paragraph using metadata + (optionally) the latest summaries.
- Leverage: `extractItemMetadata()`; add a small “library query” utility.

### P1: “True library intelligence (lightweight indexing)”

- **P1.1 — Local embedding index for items/summaries (optional)**
- Compute embeddings of item abstracts + summaries and store vectors locally; enable “find similar items” and “cluster collection”.
- Integration approach: add a new embeddings service + local storage (SQLite via Zotero APIs or JSON in extension storage).
- UX: “Find related in library” action + sidebar panel.

- **P1.2 — Evidence-first answers (quotes/annotations/page labels)**
- Tighten Q&A prompts to output answers with supporting quotes and (where possible) annotation page labels (already extracted in `extractTextFromItem()`).
- Store extracted evidence in structured block for later re-use.

### P2: “Discovery / ecosystem integration”

- **P2.1 — ‘Seed → recommendations’ using external APIs**
- Mirror ReadNext-style flow: pick a “Focus” collection; fetch candidates (OpenAlex/Semantic Scholar) and rank by similarity.
- Add as an optional action; keep it clearly separated from core summarization.

- **P2.2 — Export/interop hooks**
- Add one-click export of synthesized outputs (e.g., literature review outline, concept map edges) to CSV/JSON for tools like Elicit-style tables.

## Concrete implementation mapping (how I’ll specify details)

For each improvement I’ll describe changes such as:

- **New action(s)** under `src/modules/actions/` (e.g., `askQuestionAboutCollection.ts`, `findRelatedItems.ts`).
- **New/extended summary storage** in `src/modules/summaries/manager.ts`:
- Extend `SummaryMetadata` to support new note types (e.g., `type: "collection-question" | "connections"`), and/or add structured payload markers.
- **Prompt extensions** in `src/modules/prompts/manager.ts`:
- Add new default prompts aimed at cross-item tasks and evidence-first output.
- **Fitting / context management** reuse via `src/modules/summaries/fitter.ts`.
- **UI surfaces** via existing dialogs/menus/toolbar (in `src/modules/ui/`).
- **Preferences** additions via `src/utils/prefs.ts` (e.g., enable/disable embeddings, max candidates, storage location).

## Output format

I’ll present the final recommendations as:

- **Tool landscape table**: tool → key features → where ZoteroLM differs → takeaways.
- **Backlog table**: priority → feature → user story → pros/cons → implementation outline → estimated complexity.

## Next step after plan acceptance

- Produce the full recommendations + backlog (no code changes yet).
- Next, implement **P0.2 Generate “Connections” note for an item** in small, testable steps (new action + related-items heuristic utility + note output stored via `createSummary()`).