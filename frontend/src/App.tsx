import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";

import { Router } from "@/app/router";
import { useAuth } from "@/features/auth/store";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <div className="bg-grid" aria-hidden="true" />
          <div className="bg-glow" aria-hidden="true" />

          <Router />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}