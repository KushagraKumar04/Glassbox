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

  const remove = async () => {
    setBusy(true);
    try {
      await sourcesApi.remove(source.id);
      qc.invalidateQueries({ queryKey: ["sources"] });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await sourcesApi.refresh(source.id);
      qc.invalidateQueries({ queryKey: ["sources"] });
    } finally {
      setRefreshing(false);
    }
  };

