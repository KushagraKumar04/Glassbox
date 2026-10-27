import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/http.ts",
        "src/features/filters/encoding.ts",
        "src/features/execute/format.ts",
        "src/shared/utils/time.ts",
        "src/shared/utils/cn.ts",
      ],
      // Vitest 4 removed `coverage.all`; `include` above is now the
      // authoritative list. Do not add `all: true` — it will error.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 50,
        statements: 70,
      },
    },
  },
});