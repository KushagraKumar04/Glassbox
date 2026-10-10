import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Check,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { useExplainWhy } from "../hooks";
import type { WhyChoice, WhyConfidence } from "../api";

interface Props {
  sql: string;
  question?: string;
  datasetIds?: string[];
  sourceIds?: string[];
  open: boolean;
}
