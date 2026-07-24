"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AI_MODEL_OPTIONS,
  DEFAULT_AI_MODEL_OPTION,
  isAiModelOptionId,
  type AiModelOptionId,
} from "@/lib/ai/types";

const STORAGE_KEY = "utility.ai_model_option";

export function useAiModelSelection() {
  const [optionId, setOptionIdState] = useState<AiModelOptionId>(
    DEFAULT_AI_MODEL_OPTION
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isAiModelOptionId(raw)) {
        setOptionIdState(raw);
      } else if (raw) {
        // Migrate disabled options (e.g. former grok-4.5) to Claude.
        window.localStorage.setItem(STORAGE_KEY, DEFAULT_AI_MODEL_OPTION);
        setOptionIdState(DEFAULT_AI_MODEL_OPTION);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setOptionId = useCallback((next: AiModelOptionId) => {
    setOptionIdState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const option =
    AI_MODEL_OPTIONS.find((o) => o.id === optionId) ?? AI_MODEL_OPTIONS[0];

  return {
    optionId,
    setOptionId,
    option,
    hydrated,
    requestBody: {
      ai_model_option: option.id,
      ai_provider: option.provider,
    },
  };
}
