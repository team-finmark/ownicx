// Shown instantly while a dashboard page loads its data (Next.js streams the page in behind it).
export default function Loading() {
  return (
    <div className="skeleton-page" role="status" aria-live="polite" aria-label="Loading">
      <div className="sk sk-eyebrow" />
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
      <div className="grid g-4 mt-24">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk sk-card" />
        ))}
      </div>
      <div className="grid g-2 mt-16">
        <div className="sk sk-panel" />
        <div className="sk sk-panel" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
