import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");

describe("mobile layout containment CSS", () => {
  it("keeps the mobile graph tools drawer inside the viewport", () => {
    expect(css).toContain("max-width: calc(100vw - 20px);");
    expect(css).toContain("overscroll-behavior: contain;");
    expect(css).toContain("touch-action: pan-y;");
  });

  it("allows long mobile data tree labels to wrap inside rows", () => {
    expect(css).toContain(".pro-tree-panel .tree-row-label,");
    expect(css).toContain(".pro-tree-panel .tree-row-parent,");
    expect(css).toContain(".pro-tree-panel .tree-row-meta");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain("word-break: break-word;");
  });

  it("keeps the compact mobile insights panel above the status bar", () => {
    expect(css).toContain("@media (max-width: 640px) and (max-height: 720px)");
    expect(css).toContain(".pro-workbench.is-module-insights .insight-panel {");
    expect(css).toContain("height: 100%;");
    expect(css).toContain("min-height: 0;");
    expect(css).toContain("max-height: 100%;");
    expect(css).toContain(".pro-workbench.is-module-insights .insight-tab-panel {");
    expect(css).toContain("box-sizing: border-box;");
    expect(css).toContain("height: 100%;");
    expect(css).toContain("max-height: 100%;");
    expect(css).toContain(".pro-workbench.is-module-insights .chat-panel {");
    expect(css).toContain("box-sizing: border-box;");
    expect(css).toContain("max-height: 100%;");
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain(".pro-workbench.is-module-insights .chat-panel-header .ai-mode-note,");
    expect(css).toContain(".pro-workbench.is-module-insights .chat-messages {");
    expect(css).toContain("flex: 0 0 112px;");
    expect(css).toContain("height: 112px;");
    expect(css).toContain("max-height: 112px;");
  });

  it("pins the productized workbench chrome to fixed grid rows", () => {
    expect(css).toMatch(/\.pro-workbench \.workbench-header \{[^}]*grid-row: 1;/s);
    expect(css).toMatch(/\.pro-workbench \.workbench-next-step \{[^}]*grid-row: 3;/s);
    expect(css).toMatch(/\.pro-workbench \.workbench-main \{[^}]*grid-row: 4;/s);
    expect(css).toMatch(/\.pro-workbench \.workbench-status-bar \{[^}]*grid-row: 5;/s);
  });

  it("uses a compact mobile chat form so AI messages keep usable height", () => {
    expect(css).toContain(".pro-workbench .chat-form {\n    grid-template-columns: minmax(0, 1fr) auto;");
    expect(css).toContain("gap: 2px 6px;");
    expect(css).toContain(".pro-workbench .chat-form textarea {\n    grid-column: 1;");
    expect(css).toContain("height: 42px;");
    expect(css).toContain("min-height: 42px;");
    expect(css).toContain(".pro-workbench .chat-form button {\n    grid-column: 2;");
    expect(css).toContain("min-height: 42px;");
  });
});
