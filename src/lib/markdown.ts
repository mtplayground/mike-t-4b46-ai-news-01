import { Marked } from "marked";
import sanitizeHtml, { type IOptions } from "sanitize-html";

const markdownParser = new Marked({
  async: false,
  breaks: false,
  gfm: true,
});

const sanitizeOptions: IOptions = {
  allowedAttributes: {
    a: ["href", "name", "rel", "target", "title"],
    code: ["class"],
    img: ["alt", "height", "src", "title", "width"],
    th: ["align"],
    td: ["align"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  allowedTags: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true,
  transformTags: {
    a: (tagName, attribs) => ({
      attribs: {
        ...attribs,
        rel: "noopener noreferrer",
      },
      tagName,
    }),
  },
};

export function sanitizeHtmlFragment(html: string): string {
  return sanitizeHtml(html, sanitizeOptions);
}

export function renderMarkdownToHtml(markdown: string): string {
  const rendered = markdownParser.parse(markdown);

  if (typeof rendered !== "string") {
    throw new Error("Markdown parser returned an unexpected async result.");
  }

  return sanitizeHtmlFragment(rendered);
}
