import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type RefObject
} from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type DialogFocusTrapOptions = {
  active?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function useDialogFocusTrap<T extends HTMLElement>(
  onClose: () => void,
  options: boolean | DialogFocusTrapOptions = true
) {
  const active = typeof options === "boolean" ? options : options.active ?? true;
  const initialFocusRef = typeof options === "boolean" ? undefined : options.initialFocusRef;
  const dialogRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!active) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    focusInitialElement();

    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [active, initialFocusRef]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!activeElement || !dialogRef.current?.contains(activeElement) || activeElement === dialogRef.current) {
      focusInitialElement();
    }
  }, [active, initialFocusRef]);

  function focusInitialElement() {
    const focusableElements = getFocusableElements(dialogRef.current);
    const requestedInitialFocus = initialFocusRef?.current;
    const initialFocusTarget =
      requestedInitialFocus && focusableElements.includes(requestedInitialFocus)
        ? requestedInitialFocus
        : focusableElements[0] ?? dialogRef.current;
    initialFocusTarget?.focus({ preventScroll: true });
  }

  function handleDialogKeyDown(event: KeyboardEvent<T>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  }

  return { dialogRef, handleDialogKeyDown };
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => {
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.tabIndex >= 0 &&
        !element.hasAttribute("disabled")
      );
    }
  );
}
