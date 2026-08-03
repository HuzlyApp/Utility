"use client";

import { useCallback, useEffect, useState } from "react";

const SIDEBAR_KEY = "utility.job_workspace_sidebar_expanded";
const SUMMARY_KEY = "utility.job_workspace_summary_expanded";
const JD_KEY = "utility.job_workspace_jd_expanded";

function storageKey(base: string, userId: string) {
  return `${base}.${userId}`;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeBool(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function useJobSidebarPreference(userId: string) {
  const [sidebarExpanded, setSidebarExpandedState] = useState(true);
  const [summaryExpanded, setSummaryExpandedState] = useState(true);
  const [jdExpanded, setJdExpandedState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSidebarExpandedState(readBool(storageKey(SIDEBAR_KEY, userId), true));
    setSummaryExpandedState(readBool(storageKey(SUMMARY_KEY, userId), true));
    setJdExpandedState(readBool(storageKey(JD_KEY, userId), true));
    setHydrated(true);
  }, [userId]);

  const setSidebarExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setSidebarExpandedState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        writeBool(storageKey(SIDEBAR_KEY, userId), value);
        return value;
      });
    },
    [userId]
  );

  const setSummaryExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setSummaryExpandedState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        writeBool(storageKey(SUMMARY_KEY, userId), value);
        return value;
      });
    },
    [userId]
  );

  const setJdExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setJdExpandedState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        writeBool(storageKey(JD_KEY, userId), value);
        return value;
      });
    },
    [userId]
  );

  return {
    sidebarExpanded,
    setSidebarExpanded,
    summaryExpanded,
    setSummaryExpanded,
    jdExpanded,
    setJdExpanded,
    hydrated,
  };
}
