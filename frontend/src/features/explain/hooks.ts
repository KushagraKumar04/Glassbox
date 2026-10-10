import { useQuery } from "@tanstack/react-query";

import {
  explainApi,
  type ExplainResponse,
  type WhyResponse,
} from "./api";

/**
 * Plain-English explanation of what a SQL query does.
 */
export function useExplainSql(
  sql: string,
  question: string | undefined,
  enabled: boolean,
) {
  return useQuery<ExplainResponse>({
    queryKey: ["explain-sql", sql, question ?? ""],
    queryFn: () => explainApi.sql(sql, question ?? ""),
    enabled: enabled && sql.trim().length > 0,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    retry: 0,
  });
}

/**
 * Rationale — why the agent chose this approach.
 */
export function useExplainWhy(
  sql: string,
  question: string | undefined,
  datasetIds: string[],
  sourceIds: string[],
  enabled: boolean,
) {
  const datasetKey = datasetIds.slice().sort().join(",");
  const sourceKey = sourceIds.slice().sort().join(",");
  return useQuery<WhyResponse>({
    queryKey: [
      "explain-why",
      sql,
      question ?? "",
      datasetKey,
      sourceKey,
    ],
    queryFn: () =>
      explainApi.why(sql, question ?? "", datasetIds, sourceIds),
    enabled: enabled && sql.trim().length > 0,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    retry: 0,
  });
}