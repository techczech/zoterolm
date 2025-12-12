# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-12-12

### Fixed

- **Markdown rendering in notes**: Summary notes now render Markdown (headings, bold/italic, lists, code blocks) instead of showing raw Markdown.
- **Prompt selection**: The “Summarize with LLM” dialog now reliably uses the prompt you select.
- **Summary note titles**: Summary note titles now reflect the selected prompt name.

### Added

- **Prompt management**: CRUD prompt actions in Settings and toolbar; prompts stored with stable HTML markers for more robust parsing.

## [0.2.1] - 2025-12-11

### Fixed

- **Progress window updates**: Progress text/percentage updates now reliably update the visible progress window during summarization.
- **Dialog dropdown behavior**: Avoid accumulating multiple “click outside to close” handlers when dialogs contain multiple custom dropdowns.
- **Large PDF handling**: More robust PDF base64 encoding to avoid failures/performance issues on large files.
- **Summary parsing robustness**: Summary notes now include stable HTML markers so metadata/content extraction is less brittle (with fallback for older notes).

### Changed

- **Code organization**: Split `src/modules/actions.ts` into smaller modules and centralized HTML escaping.

## [0.2.0] - 2025-12-11

### Fixed

- **Zotero 8 Beta Compatibility**: Fixed dropdown selectors in dialogs not working in Zotero 8 Beta
  - Native HTML `<select>` and XUL `<menulist>` elements don't work properly in Zotero 8's hybrid XUL/HTML dialog context due to Firefox 115+ SelectParent.sys.mjs incompatibility
  - Implemented custom dropdown components using plain HTML divs with click handlers
  - Dropdowns now display correctly and selections persist

### Added

- Selection resolution utility to handle cases where stored preferences reference unavailable options

## [0.1.0] - 2025-12-10

### Added

- **PDF Summarization**: Extract text from PDF attachments and generate summaries using LLMs
- **Multiple LLM Provider Support**: Integration with Google Gemini and OpenAI models
  - Google Gemini: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash
  - OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-preview
- **Customizable Prompts**: Create and manage prompt templates stored as Zotero notes with `#zoterolm-prompt` tag
- **Collection Summaries**: Generate meta-summaries from existing item summaries in collections
- **Question Answering**: Ask questions about documents and get AI-generated answers saved as notes
- **Context Window Management**: Automatic fitting of content to model context limits
- **Right-click Menu Integration**: Access all features through Zotero's context menu
- **Preference Panel**: Configure API keys and default settings in Zotero preferences
- **Progress Tracking**: Visual progress indicators for long-running operations
- **Automatic Tagging**: Summaries are tagged with `#zoterolm-summary` for easy organization

### Initial Release Features

- Support for Zotero 7+
- API key configuration for Gemini and OpenAI
- Default prompts automatically created on first use
- Notes stored as child items of library entries
- Batch processing support for multiple items

[0.3.0]: https://github.com/techczech/zoterolm/releases/tag/v0.3.0
[0.2.1]: https://github.com/techczech/zoterolm/releases/tag/v0.2.1
[0.2.0]: https://github.com/techczech/zoterolm/releases/tag/v0.2.0
[0.1.0]: https://github.com/techczech/zoterolm/releases/tag/v0.1.0
