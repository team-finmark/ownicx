"use client";

import Link from "next/link";
import { useEffect } from "react";

// Pages outside the dashboard shell (e.g. sign-in) that fail to load.
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 24, margin: "0 auto 20px" }}>O</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>This page didn&apos;t load</h1>
        <p className="text-2" style={{ marginBottom: 24 }}>Something went wrong on our side. Please try again in a moment.</p>
        <div className="stack" style={{ gap: 10 }}>
          <button type="button" className="btn primary btn-lg" onClick={() => retry()}>Try again</button>
          <Link href="/" className="btn btn-lg">Back to the dashboard</Link>
        </div>
        {error.digest && <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Error reference: {error.digest}</p>}
      </div>
    </div>
  );
}
