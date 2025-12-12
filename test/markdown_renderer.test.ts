import { assert } from "chai";
import { renderMarkdownToSafeHtmlFragment } from "../src/utils/markdown";

describe("renderMarkdownToSafeHtmlFragment", function () {
  it("renders headings", function () {
    const html = renderMarkdownToSafeHtmlFragment("# Title\n\n## Subtitle");
    assert.include(html, "<h1>Title</h1>");
    assert.include(html, "<h2>Subtitle</h2>");
  });

  it("renders bullet and numbered lists", function () {
    const html = renderMarkdownToSafeHtmlFragment("- A\n- B\n\n1. One\n2. Two");
    assert.include(html, "<ul>");
    assert.include(html, "<li>A</li>");
    assert.include(html, "<li>B</li>");
    assert.include(html, "<ol>");
    assert.include(html, "<li>One</li>");
    assert.include(html, "<li>Two</li>");
  });

  it("escapes raw HTML in input", function () {
    const html = renderMarkdownToSafeHtmlFragment("<h1>X</h1>");
    assert.include(html, "&lt;h1&gt;X&lt;/h1&gt;");
    assert.notInclude(html, "<h1>X</h1>");
  });

  it("renders fenced code blocks", function () {
    const html = renderMarkdownToSafeHtmlFragment("```js\nconst x = 1;\n```");
    assert.include(html, '<code class="language-js">');
    assert.include(html, "const x = 1;");
    assert.include(html, "</code></pre>");
  });
});

