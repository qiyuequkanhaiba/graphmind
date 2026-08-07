import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultLanguage, messages, type Language, type MessageKey } from "./messages";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const languageStorageKey = "graphmind.language";

const fallbackI18n: I18nContextValue = {
  language: defaultLanguage,
  setLanguage: () => undefined,
  t: (key, values) => formatMessage(messages[defaultLanguage][key], values)
};

type Props = {
  children: ReactNode;
  initialLanguage?: Language;
};

export function I18nProvider({ children, initialLanguage }: Props) {
  const [language, setLanguageState] = useState<Language>(() =>
    initialLanguage ?? readStoredLanguage() ?? defaultLanguage
  );
  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    persistLanguage(nextLanguage);
  }, []);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, values) => formatMessage(messages[language][key], values)
    }),
    [language, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    return fallbackI18n;
  }
  return value;
}

function formatMessage(message: string, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce(
    (formatted, [key, value]) => formatted.split(`{${key}}`).join(String(value)),
    message
  );
}

function readStoredLanguage(): Language | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const storedLanguage = window.localStorage.getItem(languageStorageKey);
    return isLanguage(storedLanguage) ? storedLanguage : null;
  } catch {
    return null;
  }
}

function persistLanguage(language: Language) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(languageStorageKey, language);
  } catch {
    // Storage can be blocked in private or restricted contexts; keep UI state working.
  }
}

function isLanguage(value: string | null): value is Language {
  return value === "zh-CN" || value === "en-US";
}
