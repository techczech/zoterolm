# ZoteroLM

A Zotero 8 (beta) plugin that enables LLM-powered summarization of your library items using Google Gemini or OpenAI.

> Note: ZoteroLM currently targets Zotero 8’s UI/runtime (Firefox 115+). Zotero 7 is not the primary target.

## Features

- **PDF Summarization**: Extract text from PDF attachments and generate summaries using LLMs
- **Markdown-rendered notes**: Summaries are saved as notes with rendered Markdown (headings, bold/italic, lists, code)
- **Multiple LLM Providers**: Support for Google Gemini and OpenAI models
- **Customizable prompts**: Create and manage prompt templates stored as Zotero notes
- **Prompt management UI**: Create/open/duplicate/delete prompts from Settings and the toolbar menu
- **Per-run prompt selection**: The “Summarize with LLM” dialog uses the prompt you select for that run
- **Collection Summaries**: Generate meta-summaries from existing item summaries
- **Question Answering**: Ask questions about your documents
- **Context Window Management**: Automatic fitting of content to model context limits

## 0.4.0-alpha.0 (Zotero 8 beta Reader alpha)

This alpha adds an **in-reader panel** (Reader tab) with early LLM-assisted reading features:

- **Clickable AI Outline / TOC**: Generate a structured outline with page numbers and click to jump
- **Auto-tag suggestions for highlights/annotations**: Suggest tags, review, and apply/ignore
- **Ask about selection**: Q&A on the currently selected highlight/annotation (optionally save as note)
- **Section summaries**: Summarize an outline section (inferred page range) and cache results
- **Glossary**: Build a term glossary from document text + your annotations; click terms to search in the PDF

Notes:
- This is **alpha-quality** and targets **Zotero 8 beta**; internal reader APIs may change.
- Some features use **vision-capable models** by sending the PDF (for outline/section summaries).
- Cached artifacts are stored as tagged child notes (e.g. `#zoterolm-outline`, `#zoterolm-glossary`).

## Supported Models

### Google Gemini

- all models

### OpenAI

- all models

## Installation

1. Download the latest `.xpi` file from the Releases page
2. In Zotero, go to Tools → Add-ons
3. Click the gear icon and select "Install Add-on From File..."
4. Select the downloaded `.xpi` file

### Zotero version

- **Recommended**: Zotero 8 (beta)

## Configuration

1. Go to Zotero Preferences → ZoteroLM
2. Enter your API key(s):
   - For Gemini: Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - For OpenAI: Get a key from [OpenAI Platform](https://platform.openai.com/api-keys)
3. Select your default model and prompt

## Usage

### Summarizing Items

1. Select one or more items in your library
2. Right-click and choose "ZoteroLM → Summarize with LLM"
3. Select a model and prompt template
4. Click "Summarize"

Summaries are saved as child notes with the tag `#zoterolm-summary`.

### Asking Questions

1. Select an item with a PDF attachment
2. Right-click and choose "ZoteroLM → Ask Question about Item"
3. Enter your question
4. The answer will be saved as a child note

### Collection Summaries

1. Right-click on a collection
2. Choose "ZoteroLM → Summarize Collection"
3. The plugin will create a meta-summary from existing item summaries

Note: Items must have existing summaries before generating a collection summary.

### Managing Prompts

Prompts are stored as standalone Zotero notes with the tag `#zoterolm-prompt`.

- Use `{{content}}` as a placeholder for the document text
- You can manage prompts in **Zotero Preferences → ZoteroLM** or via the **toolbar menu**

Default prompts are created automatically on first use. You can edit or create new prompts directly in Zotero.

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run start
```

This will start Zotero with the plugin in development mode with hot reload.

## License

MIT License - see [LICENSE](LICENSE) for details
