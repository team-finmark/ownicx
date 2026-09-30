"use client";

import { useActionState, useState } from "react";
import { signIn } from "@/app/auth-actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" className="input input-lg" autoComplete="username" autoFocus required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div style={{ position: "relative" }}>
          <input id="password" name="password" type={show ? "text" : "password"} className="input input-lg" autoComplete="current-password" required style={{ paddingRight: 84 }} />
          <button type="button" className="btn ghost sm" onClick={() => setShow((s) => !s)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {state && !state.ok && (
        <div className="callout" role="alert" style={{ background: "var(--bad-soft)", color: "var(--bad)", fontSize: 14 }}>
          {state.message}
        </div>
      )}
      <button type="submit" className="btn primary btn-lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
