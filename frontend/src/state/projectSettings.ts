import type { ProjectSettings } from "../api/types";

type ProjectSettingsInput =
  | {
      ai?: {
        chat?: Partial<ProjectSettings["ai"]["chat"]>;
        vector?: Partial<ProjectSettings["ai"]["vector"]>;
      };
      review_analytics?: Partial<ProjectSettings["review_analytics"]>;
    }
  | null
  | undefined;

const reviewAnalyticsRetentionOptions = [30, 90, 180, 365] as const;

export const defaultProjectSettings: ProjectSettings = {
  ai: {
    chat: {
      provider: "rules",
      model: "graphmind-rules",
      base_url: "",
      api_key: "",
      temperature: 0.1
    },
    vector: {
      provider: "none",
      model: "",
      base_url: "",
      api_key: "",
      dimensions: 0,
      index_status: "not_built",
      document_count: 0,
      last_built_at: null,
      embedding_model: ""
    }
  },
  review_analytics: {
    retention_days: 30,
    auto_cleanup_enabled: false
  }
};

export function normalizeProjectSettings(settings: ProjectSettingsInput): ProjectSettings {
  const retentionDays = normalizeReviewAnalyticsRetentionDays(
    settings?.review_analytics?.retention_days
  );

  return {
    ai: {
      chat: {
        ...defaultProjectSettings.ai.chat,
        ...(settings?.ai?.chat ?? {})
      },
      vector: {
        ...defaultProjectSettings.ai.vector,
        ...(settings?.ai?.vector ?? {})
      }
    },
    review_analytics: {
      ...defaultProjectSettings.review_analytics,
      ...(settings?.review_analytics ?? {}),
      retention_days: retentionDays,
      auto_cleanup_enabled: settings?.review_analytics?.auto_cleanup_enabled === true
    }
  };
}

function normalizeReviewAnalyticsRetentionDays(
  value: ProjectSettings["review_analytics"]["retention_days"] | undefined
): ProjectSettings["review_analytics"]["retention_days"] {
  const numericValue = Number(value);
  return reviewAnalyticsRetentionOptions.includes(
    numericValue as (typeof reviewAnalyticsRetentionOptions)[number]
  )
    ? numericValue
    : defaultProjectSettings.review_analytics.retention_days;
}
