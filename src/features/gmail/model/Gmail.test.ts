import { describe, expect, it } from "vitest";
import { mailDocument } from "@/features/gmail/model/Gmail";

describe("mailDocument", () => {
  it("asks for light only before the message's own styles, and leaves the message as sent", () => {
    const html = '<meta name="color-scheme" content="light dark"><style>@media not (prefers-color-scheme: dark){.a{color:#111}}</style><p>About prefers-color-scheme: dark in CSS</p>';
    const document = mailDocument(html, false);
    expect(document).toContain(`<body>${html}</body>`);
    const head = document.slice(0, document.indexOf("<body>"));
    expect(head).toContain('<meta name="color-scheme" content="light only">');
    expect(head).toContain(":root{color-scheme:light only !important}");
  });

  it("allows remote images only when asked", () => {
    expect(mailDocument("", false)).not.toContain("https:");
    expect(mailDocument("", true)).toContain("img-src data: cid: https: http:");
  });
});
