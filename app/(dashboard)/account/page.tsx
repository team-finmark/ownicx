import { changePassword } from "@/app/auth-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, PageHeader } from "@/components/kit";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";

export default async function Account() {
  const me = await requireManager();
  const row = await db.get("managers", me.id);
  return (
    <>
      <PageHeader eyebrow="Account" title={`Hi, ${me.name}`} sub="Your manager sign-in for this dashboard." />
      <div className="grid g-2">
        <Card title="Change password">
          <ActionForm action={changePassword} resetOnSuccess className="stack">
            <div className="field"><label htmlFor="cur">Current password</label><input id="cur" name="current" type="password" className="input" autoComplete="current-password" required /></div>
            <div className="field"><label htmlFor="new">New password</label><input id="new" name="next" type="password" className="input" autoComplete="new-password" required minLength={8} /><span className="hint">At least 8 characters, with letters and a number.</span></div>
            <div className="field"><label htmlFor="cf">Confirm new password</label><input id="cf" name="confirm" type="password" className="input" autoComplete="new-password" required minLength={8} /></div>
            <Submit>Update password</Submit>
          </ActionForm>
        </Card>
        <Card title="Sign-in details">
          <dl className="kv">
            <dt>Name</dt><dd>{me.name}</dd>
            <dt>Last sign-in</dt><dd>{row?.last_login_at ? formatDate(row.last_login_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</dd>
            <dt>Session</dt><dd>Signs out automatically after 12 hours</dd>
          </dl>
          <p className="muted mt-16" style={{ fontSize: 14 }}>
            To add another manager or reset a forgotten password, run <span className="mono">npm run manager -- &quot;Name&quot; &quot;NewPassword1&quot;</span> on the computer that has the <span className="mono">.env.local</span> file.
          </p>
        </Card>
      </div>
    </>
  );
}
