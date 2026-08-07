import { type KeyboardEvent } from "react";

type Option<T extends string> = {
  value: T;
};

export function createRovingTabKeyDownHandler<T extends string>({
  activeValue,
  onChange,
  options
}: {
  activeValue: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
}) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = options.findIndex((option) => option.value === activeValue);
    const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = nextTabIndex(event.key, fallbackIndex, options.length);

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextValue = options[nextIndex]?.value;
    if (!nextValue) {
      return;
    }

    onChange(nextValue);
    focusSiblingTab(event.currentTarget, nextIndex);
  };
}

function nextTabIndex(key: string, currentIndex: number, count: number): number | null {
  if (count === 0) {
    return null;
  }

  if (key === "ArrowRight" || key === "ArrowDown") {
    return (currentIndex + 1) % count;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return (currentIndex - 1 + count) % count;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return count - 1;
  }
  return null;
}

function focusSiblingTab(currentTab: HTMLButtonElement, nextIndex: number) {
  const tabList = currentTab.closest('[role="tablist"]');
  const tabs = tabList ? Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
  tabs[nextIndex]?.focus({ preventScroll: true });
}
