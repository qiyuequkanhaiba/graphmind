import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("application theme styles", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");

  it("themes bootstrap and authentication surfaces with product tokens", () => {
    expect(css).toMatch(/\.topbar\s*\{[\s\S]*?background:\s*var\(--gm-panel\)/);
    expect(css).toMatch(/\.empty-workspace\s*\{[\s\S]*?background:\s*var\(--gm-panel\)/);
    expect(css).toMatch(/html\[data-theme="light"\][\s\S]*?--gm-panel:\s*#ffffff/);
  });

  it("uses theme tokens throughout project sharing controls", () => {
    expect(css).toMatch(/\.project-sharing-dialog\s*\{[\s\S]*?background:\s*var\(--gm-panel\)/);
    expect(css).toMatch(/\.project-sharing-form input,[\s\S]*?background:\s*var\(--gm-elevated\)/);
    expect(css).toMatch(/\.project-sharing-created code\s*\{[\s\S]*?color:\s*var\(--gm-text\)/);
  });
});
