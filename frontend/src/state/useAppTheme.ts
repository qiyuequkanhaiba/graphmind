import { useCallback, useLayoutEffect, useState } from "react";
import {
  persistWorkbenchTheme,
  readWorkbenchTheme,
  type WorkbenchTheme
} from "./workbenchTheme";

export function useAppTheme() {
  const [theme, setTheme] = useState<WorkbenchTheme>(() => readWorkbenchTheme());

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.body.removeAttribute("data-theme");
      document.documentElement.style.colorScheme = "";
    };
  }, [theme]);

  const handleThemeChange = useCallback((nextTheme: WorkbenchTheme) => {
    setTheme(nextTheme);
    persistWorkbenchTheme(nextTheme);
  }, []);

  return { handleThemeChange, theme };
}
