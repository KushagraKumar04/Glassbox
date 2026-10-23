import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { historyApi, type HistoryMatch } from "./history-api";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 180;

/**
 * Debounced search over the user's past questions.
 *
 * Returns [] while the query is too short. Cached per (query) for 60 s so
 * navigating back and forth is instant.
 */
export function useQuestionHistory(rawQuery: string) {
  const [debounced, setDebounced] = useState(rawQuery);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(rawQuery), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [rawQuery]);

  const trimmed = debounced.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["history-autocomplete", trimmed],
    queryFn: () => historyApi.search(trimmed, 8),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 0,
  });

  const matches: HistoryMatch[] = enabled ? (data?.matches ?? []) : [];

  return {
    matches,
    isLoading: enabled && isFetching,
    isError,
  };
}