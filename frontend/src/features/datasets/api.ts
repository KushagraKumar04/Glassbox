import { apiDelete, apiGet, apiUpload } from "@/lib/http";

export interface ColumnProfile {
  name: string;
  type: string;
  total?: number;
  nulls?: number;
  cardinality?: number;
  null_rate?: number;
}

export interface DatasetProfile {
  table: string;
  row_count: number;
  column_count: number;
  columns: ColumnProfile[];
  sample: Record<string, unknown>[];
  source_path: string;
  file_type: string;
  original_filename: string;
}

export interface Dataset {
  id: string;
  name: string;
  table_name: string;
  file_type: string;
  row_count: number;
  column_count: number;
  profile: DatasetProfile;
  created_at: string;
}

export const datasetsApi = {
  list: () => apiGet<Dataset[]>("/datasets"),
  get: (id: string) => apiGet<Dataset>(`/datasets/${id}`),
  upload: (file: File) => apiUpload<Dataset>("/datasets/upload", file),
  remove: (id: string) => apiDelete(`/datasets/${id}`),
};