"use client";

import { useEffect } from "react";

// Last-resort screen when even the root layout fails. It replaces the whole document, so it carries
// its own <html>, <body> and inline styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f5f2", color: "#151c2c", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Ownicx couldn&apos;t load</h1>
          <p style={{ color: "#5b6170", margin: "0 0 24px" }}>Something went wrong on our side. Please try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ width: "100%", height: 44, border: 0, borderRadius: 10, background: "#151c2c", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
          {error.digest && <p style={{ color: "#8a8f99", fontSize: 12, marginTop: 16 }}>Error reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
