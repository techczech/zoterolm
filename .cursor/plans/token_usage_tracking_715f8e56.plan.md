---
name: Token usage tracking
overview: Add per-note token usage annotations and a persistent token-usage log (prefs + a Zotero note), using provider-reported usage when available and falling back to the existing rough estimator when not.
todos:
  - id: token-types
    content: Define `TokenUsage` + extend `LLMResponse` to include usage.
    status: pending
  - id: provider-usage
    content: Update `openai.ts`/`gemini.ts` to return usage and plumb through `callLLM`.
    status: pending
  - id: fallback-estimate
    content: Implement estimation fallback in `callLLM` using existing `estimateTokenCount`.
    status: pending
  - id: note-annotation
    content: Render token usage in `createSummary`/`formatSummaryAsHtml` and in `summarizeCollection` header.
    status: pending
  - id: persistent-log
    content: Add prefs keys + implement `src/modules/tokens/log.ts` to update prefs and append to a Zotero token-log note.
    status: pending
  - id: wire-call-sites
    content: Call `appendTokenUsage` from the three action entrypoints with appropriate context.
    status: pending
  - id: tests
    content: Add/adjust unit tests for mapping + estimation logic.
    status: pending
---

# Token counter + token usage log

## Goals

- **Per-note token counter**: every generated summary/Q&A/collection-summary note includes token usage for the LLM call that produced it.
- **Persistent token usage log**: maintain (a) a machine-readable log + running total in prefs, and (b) a human-readable “Token Log” Zotero note that gets appended to.
- **Counting method**: use provider-reported usage when available (OpenAI `usage`, Gemini `usageMetadata`), otherwise fall back to `estimateTokenCount()`.

## Key code locations (current)

- **LLM routing**: `src/modules/llm/service.ts` (`callLLM`, `estimateTokenCount`)
- **Provider clients**: `src/modules/llm/openai.ts`, `src/modules/llm/gemini.ts`
- **Note creation (item + question)**: `src/modules/summaries/manager.ts` (`createSummary`, `formatSummaryAsHtml`)
- **Note creation (collection)**: `src/modules/actions/summarizeCollection.ts` (creates `new Zotero.Item("note")` directly)
- **Call sites**: `src/modules/actions/summarizeSelectedItems.ts`, `src/modules/actions/askQuestionAboutItem.ts`, `src/modules/actions/summarizeCollection.ts`
- **Prefs wrapper + typing**: `src/utils/prefs.ts`, `addon/prefs.js`, `typings/prefs.d.ts`

## Design

### 1) Standardize token usage data

- Add a small shared type (e.g. `TokenUsage`) with:
- `promptTokens?: number`
- `completionTokens?: number`
- `totalTokens: number`
- `isEstimated: boolean`
- Extend `LLMResponse` in `src/modules/llm/service.ts` to include `usage?: TokenUsage`.

### 2) Capture provider-reported usage

- Update provider clients to return both text and usage:
- `callOpenAI(...)` / `callOpenAIWithImage(...)` return `{ text, usage?: TokenUsage }` by mapping OpenAI `data.usage`.
- `callGemini(...)` / `callGeminiWithPDF(...)` return `{ text, usage?: TokenUsage }` by mapping Gemini `data.usageMetadata`.
- Update `callLLM` to propagate usage into the unified `LLMResponse`.

### 3) Fallback estimation when usage missing

- In `callLLM`, if provider usage is missing:
- estimate prompt tokens from the actual request payload sent (same combined string the provider sees; for current Gemini/OpenAI text calls that’s essentially `content ? `${prompt}\n\n---\n\n${content}` : prompt`).
- estimate completion tokens from returned `text`.
- set `totalTokens = prompt + completion`, `isEstimated = true`.

### 4) Show token usage inside generated notes

- **Item summaries + Q&A notes**: extend `SummaryMetadata` in `src/modules/summaries/manager.ts` with optional `tokenUsage?: TokenUsage` and render an extra line in the existing meta header (`<div id="zoterolm-summary-meta" ...>`):
- e.g. `Tokens: 1234 total (prompt 900, completion 334) [estimated]` (include breakdown only when known; add `[estimated]` when `isEstimated`)
- keep the rendering stable by adding a `data-zoterolm-tokens-total="..."` attribute on the meta div as well, so it’s machine-readable later.
- **Collection summary note**: in `src/modules/actions/summarizeCollection.ts`, add the same “Tokens:” line to its header block (currently the blue header at lines ~130–137).

### 5) Persistent token log (prefs + Zotero note)

- Add new prefs keys:
- `tokenUsageTotal` (number)
- `tokenUsageLog` (stringified JSON array, capped to last N entries)
- `tokenLogNoteId` (number or string; whichever fits existing prefs typing)
- Update defaults in `addon/prefs.js` and types in `typings/prefs.d.ts`.
- Add a small module (new, ~150 lines) e.g. `src/modules/tokens/log.ts` that:
- defines a `TokenUsageLogEntry` `{ ts, provider, modelId, totalTokens, promptTokens?, completionTokens?, isEstimated, purpose, itemTitle? }`
- `appendTokenUsage(entry)`:
- updates `tokenUsageTotal += entry.totalTokens`
- appends to `tokenUsageLog` (cap to N, e.g. 200)
- ensures a dedicated Zotero note exists (create if missing; store its id in `tokenLogNoteId`)
- appends a human-readable line to a `<pre id="zoterolm-token-log">...</pre>` block inside that note.
- Where to call it:
- After each successful LLM call in:
- `summarizeSelectedItems.ts`
- `askQuestionAboutItem.ts`
- `summarizeCollection.ts`
- Each call site supplies `purpose` (`item_summary` / `question` / `collection_summary`) and `itemTitle`/`collection.name` where available.

## Safety/compat notes

- Keep the token-log note’s HTML wrapped in stable markers (`id="zoterolm-token-log"`) so appends don’t require complex HTML parsing.
- Cap the prefs log length to avoid unbounded growth.
- Don’t store prompts/content in the log (privacy + size); store only metadata + counts.

## Test plan (lightweight)

- Add unit tests for usage mapping + estimation:
- mapping OpenAI usage -> `TokenUsage`
- mapping Gemini usageMetadata -> `TokenUsage`
- estimation fallback produces `isEstimated: true` and totals match `estimateTokenCount`.
- (Tests likely live under `test/` alongside existing TS tests.)

## Deliverables

- Notes show token usage line for item summaries, Q&A notes, and collection summaries.
- Prefs contain running total + capped JSON log.
- A dedicated “ZoteroLM Token Log” note is created/updated and appended to per call.