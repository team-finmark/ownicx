import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 24, margin: "0 auto 20px" }}>O</div>
        <p className="muted" style={{ fontSize: 14, fontWeight: 600 }}>404</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 8px" }}>This page doesn&apos;t exist</h1>
        <p className="text-2" style={{ marginBottom: 24 }}>The link may be old or mistyped.</p>
        <Link href="/" className="btn primary btn-lg" style={{ width: "100%" }}>Back to the dashboard</Link>
      </div>
    </div>
  );
}
