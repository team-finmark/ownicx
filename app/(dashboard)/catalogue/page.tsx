import { adjustStockAction, saveProductAction, saveServiceAction, serviceActiveAction } from "@/app/ops-actions";
import { ActionForm, LiveSwitch, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, inr, num, PageHeader, Stat } from "@/components/kit";
import { requireAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";
import type { InventoryItem, Service } from "@/lib/types";

function ServiceFields({ s }: { s?: Service }) {
  const p = s?.id ?? "new";
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid g-2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor={`sv-n-${p}`}>Name</label><input id={`sv-n-${p}`} name="name" className="input" required maxLength={80} defaultValue={s?.name} /></div>
        <div className="field"><label htmlFor={`sv-c-${p}`}>Category</label><input id={`sv-c-${p}`} name="category" className="input" list="svc-cats" required maxLength={40} defaultValue={s?.category} /></div>
        <div className="field"><label htmlFor={`sv-p-${p}`}>Price ₹</label><input id={`sv-p-${p}`} name="price" type="number" min={0} step="1" className="input" required defaultValue={s?.price} /></div>
        <div className="field"><label htmlFor={`sv-d-${p}`}>Duration (min)</label><input id={`sv-d-${p}`} name="duration_min" type="number" min={5} max={600} step="5" className="input" required defaultValue={s?.duration_min ?? 30} /></div>
        <div className="field">
          <label htmlFor={`sv-g-${p}`}>For</label>
          <select id={`sv-g-${p}`} name="gender" className="select" defaultValue={s?.gender ?? "unisex"}><option value="unisex">Unisex</option><option value="women">Women</option><option value="men">Men</option></select>
        </div>
        <div className="field"><label htmlFor={`sv-pt-${p}`}>Loyalty points</label><input id={`sv-pt-${p}`} name="points" type="number" min={0} step="1" className="input" defaultValue={s?.points ?? 0} /></div>
        <div className="field"><label htmlFor={`sv-r-${p}`}>Revisit cycle (days)</label><input id={`sv-r-${p}`} name="revisit_days" type="number" min={1} max={730} className="input" defaultValue={s?.revisit_days ?? ""} placeholder="none" /><span className="hint">Drives revisit reminders</span></div>
      </div>
    </>
  );
}

function ProductFields({ p }: { p?: InventoryItem }) {
  const k = p?.id ?? "new";
  return (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid g-2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor={`pr-n-${k}`}>Name</label><input id={`pr-n-${k}`} name="name" className="input" required maxLength={100} defaultValue={p?.name} /></div>
        <div className="field"><label htmlFor={`pr-c-${k}`}>Category</label><input id={`pr-c-${k}`} name="category" className="input" maxLength={40} defaultValue={p?.category ?? ""} /></div>
        <div className="field"><label htmlFor={`pr-p-${k}`}>Retail price ₹</label><input id={`pr-p-${k}`} name="price" type="number" min={0} step="1" className="input" required defaultValue={p?.price} /></div>
        <div className="field"><label htmlFor={`pr-r-${k}`}>Reorder when at or below</label><input id={`pr-r-${k}`} name="reorder_level" type="number" min={0} step="1" className="input" defaultValue={p?.reorder_level ?? 3} /></div>
        {!p && <div className="field"><label htmlFor={`pr-q-${k}`}>Opening stock</label><input id={`pr-q-${k}`} name="quantity" type="number" min={0} step="1" className="input" defaultValue={0} /></div>}
      </div>
    </>
  );
}

export default async function Catalogue() {
  await requireAdmin();
  const [services, products, moves] = await Promise.all([db.list("services"), db.list("inventory"), db.query("stock_movements", { order: { column: "created_at", ascending: false }, limit: 25 })]);
  services.sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  products.sort((a, b) => a.name.localeCompare(b.name));
  const low = products.filter((p) => p.quantity <= p.reorder_level);
  const prodName = new Map(products.map((p) => [p.id, p.name]));

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <datalist id="svc-cats">{[...new Set(services.map((s) => s.category))].map((c) => <option key={c} value={c} />)}</datalist>
      <PageHeader eyebrow="Back office" title="Services & stock" sub="The menu the front desk books and bills from, and the retail shelf. Selling a product on a bill takes it off stock automatically." />

      <div className="grid g-4">
        <Stat label="Services on the menu" value={num(services.filter((s) => s.is_active !== false).length)} delta={`${services.filter((s) => s.is_active === false).length} retired`} />
        <Stat label="Products" value={num(products.length)} delta={`${num(products.reduce((a, p) => a + p.quantity, 0))} units on the shelf`} />
        <Stat label="Stock value (retail)" value={inr(products.reduce((a, p) => a + p.quantity * p.price, 0))} />
        <Stat label="Running low" value={num(low.length)} tone={low.length ? "down" : undefined} delta={low.length ? low.map((p) => p.name.split(" ").slice(0, 2).join(" ")).join(", ") : "all stocked"} />
      </div>

      <h2 className="section-title">Service menu</h2>
      <div className="grid g-main">
        <Card>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Service</th><th>For</th><th className="r">Price</th><th className="r">Time</th><th className="r">Points</th><th>On menu</th><th className="sticky-end" /></tr></thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} style={{ opacity: s.is_active === false ? 0.55 : 1 }}>
                    <td><b>{s.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{s.category}{s.revisit_days ? ` · every ~${s.revisit_days} days` : ""}</div></td>
                    <td>{s.gender ?? "unisex"}</td>
                    <td className="r">{inr(s.price)}</td>
                    <td className="r">{s.duration_min ?? 30} min</td>
                    <td className="r">{s.points}</td>
                    <td><LiveSwitch checked={s.is_active !== false} label={`${s.name} on the menu`} onToggle={serviceActiveAction.bind(null, s.id)} /></td>
                    <td className="sticky-end">
                      <details className="row-edit">
                        <summary className="btn sm">Edit</summary>
                        <div className="row-edit-panel">
                          <ActionForm action={saveServiceAction} className="stack" style={{ gap: 12 }}>
                            <ServiceFields s={s} />
                            <Submit className="btn sm primary">Save</Submit>
                          </ActionForm>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Add a service" sub="Retire services instead of deleting them, so old bills keep their history">
          <ActionForm action={saveServiceAction} resetOnSuccess className="stack" style={{ gap: 12 }}>
            <ServiceFields />
            <Submit>Add to menu</Submit>
          </ActionForm>
        </Card>
      </div>

      <h2 className="section-title">Retail products</h2>
      <div className="grid g-main">
        <Card>
          {products.length === 0 ? <div className="empty">No products yet.</div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Product</th><th className="r">Price</th><th className="r">In stock</th><th style={{ minWidth: 260 }}>Stock in / out</th><th className="sticky-end" /></tr></thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{p.category ?? "—"}</div></td>
                      <td className="r">{inr(p.price)}</td>
                      <td className="r"><b>{p.quantity}</b>{p.quantity <= p.reorder_level && <div><Badge tone={p.quantity === 0 ? "bad" : "warn"}>{p.quantity === 0 ? "Out" : "Reorder"}</Badge></div>}</td>
                      <td>
                        <ActionForm action={adjustStockAction} resetOnSuccess className="row" style={{ gap: 6 }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input name="delta" type="number" step="1" className="input num-in" style={{ width: 80 }} placeholder="+12" aria-label={`Units for ${p.name}`} required />
                          <select name="reason" className="select" style={{ width: 130 }} aria-label="Reason"><option value="purchase">Purchase</option><option value="return">Return</option><option value="adjustment">Adjustment</option></select>
                          <input type="hidden" name="note" value="" />
                          <Submit className="btn sm">Apply</Submit>
                        </ActionForm>
                      </td>
                      <td className="sticky-end">
                        <details className="row-edit">
                          <summary className="btn sm">Edit</summary>
                          <div className="row-edit-panel">
                            <ActionForm action={saveProductAction} className="stack" style={{ gap: 12 }}>
                              <ProductFields p={p} />
                              <Submit className="btn sm primary">Save</Submit>
                            </ActionForm>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title="Add a product">
            <ActionForm action={saveProductAction} resetOnSuccess className="stack" style={{ gap: 12 }}>
              <ProductFields />
              <Submit>Add product</Submit>
            </ActionForm>
          </Card>
          <Card title="Recent stock movements">
            {moves.length === 0 ? <div className="empty">None yet.</div> : (
              <div className="list">
                {moves.map((m) => (
                  <div className="list-item" key={m.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{prodName.get(m.inventory_id) ?? "Removed product"}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{m.reason}{m.note ? ` · ${m.note}` : ""} · {formatDate(m.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{m.created_by ? ` · ${m.created_by}` : ""}</div>
                    </div>
                    <Badge tone={m.delta > 0 ? "good" : undefined}>{m.delta > 0 ? `+${m.delta}` : m.delta}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
