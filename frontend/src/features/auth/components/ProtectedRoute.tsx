import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../store";

/**
 * Wrap protected routes with this. Behavior:
 *   - bootstrapping → shows a loading state
 *   - auth disabled → renders children (single-user mode)
 *   - authenticated → renders children
 *   - guest mode enabled + anonymous → renders children (browse-only)
 *   - auth enabled + no user + guest mode off → redirects to /login?next=...
 */
export function ProtectedRoute() {
  const { status, enabled, user, config } = useAuth();
  const location = useLocation();

  if (status === "bootstrapping") {
    return (
      <div className="min-h-screen grid place-items-center text-muted">
        <div className="text-center">
          <div
            className="w-8 h-8 rounded-lg mx-auto mb-4 animate-pulse"
            style={{ background: "linear-gradient(135deg,#22D3EE,#8B5CF6)" }}
          />
          <div className="font-mono text-[12px]">Loading…</div>
        </div>
      </div>
    );
  }

  // Single-user mode
  if (!enabled) return <Outlet />;

  // Authenticated
  if (user) return <Outlet />;

  // Guest mode → allow through
  if (config?.guest_mode) return <Outlet />;

  // Strict mode → redirect to login
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`/login?next=${next}`} replace />;
}