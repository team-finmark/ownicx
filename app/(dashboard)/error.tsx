"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown inside the dashboard shell when a page fails to load (e.g. the database is briefly unreachable).
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card" style={{ maxWidth: 520, margin: "48px auto", textAlign: "center", padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>This page didn&apos;t load</h1>
      <p className="text-2" style={{ marginBottom: 24 }}>Something went wrong on our side. Your data is safe. Try again, or go back to the overview.</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn primary" onClick={() => retry()}>Try again</button>
        <Link href="/" className="btn">Back to overview</Link>
      </div>
      {error.digest && <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Error reference: {error.digest}</p>}
    </div>
  );
}
