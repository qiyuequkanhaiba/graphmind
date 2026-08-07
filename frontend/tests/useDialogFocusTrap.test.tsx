import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useDialogFocusTrap } from "../src/components/workbench/useDialogFocusTrap";

function DialogWithCustomInitialFocus() {
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const { dialogRef, handleDialogKeyDown } = useDialogFocusTrap<HTMLElement>(vi.fn(), {
    initialFocusRef
  });

  return (
    <section
      aria-label="Custom dialog"
      aria-modal="true"
      onKeyDown={handleDialogKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <button type="button">Close</button>
      <input aria-label="Search commands" ref={initialFocusRef} />
      <button type="button">Apply</button>
    </section>
  );
}

describe("useDialogFocusTrap", () => {
  it("honors an explicit initial focus target inside the dialog", () => {
    render(<DialogWithCustomInitialFocus />);

    expect(screen.getByRole("textbox", { name: "Search commands" })).toHaveFocus();
  });
});
