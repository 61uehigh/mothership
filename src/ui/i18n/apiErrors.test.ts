import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "@/lib/apiErrorCodes";
import { apiErrorText } from "@/ui/i18n/apiErrors";
import { en } from "@/ui/i18n/messages";

describe("apiErrorText", () => {
  it("fills every placeholder of a code's text from the facts the route sent", () => {
    for (const code of API_ERROR_CODES) {
      const names = [...en[`apiError.${code}`].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const params = Object.fromEntries(names.map((name) => [name, `<${name}>`]));
      for (const locale of ["en", "ko"] as const) {
        const text = apiErrorText(code, locale, params) ?? "";
        for (const name of names) expect(text, `${code} (${locale})`).toContain(`<${name}>`);
        expect(text, `${code} (${locale})`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
