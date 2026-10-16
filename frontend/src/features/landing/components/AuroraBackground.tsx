/**
 * Ambient background for the landing page.
 *
 * Layers:
 *   - grid (existing .bg-grid, extends across the whole page)
 *   - three drifting gradient orbs (aurora)
 *   - two slowly rotating wireframe rings
 *   - subtle noise overlay for texture
 *
 * Everything is `pointer-events: none` and `aria-hidden`.
 */
export function AuroraBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Base grid */}
      <div className="bg-grid" />

      {/* Aurora orbs */}
      <div className="aurora-orb aurora-orb-1" />
      <div className="aurora-orb aurora-orb-2" />
      <div className="aurora-orb aurora-orb-3" />

      {/* Rotating rings — top right */}
      <div className="ring-spinner ring-spinner-1">
        <div className="ring-circle" />
        <div className="ring-circle ring-circle-2" />
      </div>

      {/* Rotating rings — bottom left */}
      <div className="ring-spinner ring-spinner-2">
        <div className="ring-circle" />
        <div className="ring-circle ring-circle-2" />
      </div>

      {/* Noise overlay */}
      <div className="noise-overlay" />
    </div>
  );
}