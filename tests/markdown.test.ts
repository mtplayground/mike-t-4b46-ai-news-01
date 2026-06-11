import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml, sanitizeHtmlFragment } from "@/lib/markdown";

describe("markdown rendering and sanitization", () => {
  it("renders GitHub-flavored markdown to HTML", () => {
    const html = renderMarkdownToHtml(
      "# Heading\n\nVisit [AI News](https://example.test).",
    );

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain('href="https://example.test"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("removes unsafe tags and attributes from raw HTML", () => {
    const html = sanitizeHtmlFragment(
      '<script>alert("xss")</script><p onclick="alert(1)">Safe</p>',
    );

    expect(html).toBe("<p>Safe</p>");
  });

  it("drops unsafe URL schemes for links and images", () => {
    const html = renderMarkdownToHtml(
      '[bad link](javascript:alert(1))\n\n<img src="javascript:alert(1)" alt="bad">',
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("src=");
    expect(html).not.toContain("href=");
  });
});
