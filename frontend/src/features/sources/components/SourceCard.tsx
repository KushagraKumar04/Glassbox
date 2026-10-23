import { useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, Server, Trash2 } from "lucide-react";
import { useState } from "react";

import { sourcesApi, type DataSource } from "../api";

const KIND_LABEL: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
};

export function SourceCard({ source }: { source: DataSource }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
