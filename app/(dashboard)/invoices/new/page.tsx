import Link from "next/link";
import { InvoiceBuilder } from "@/components/InvoiceBuilder";
import { DemoBanner, PageHeader } from "@/components/kit";
import { requireManager } from "@/lib/auth";
import * as db from "@/lib/db";
import { istToday } from "@/lib/ops-time";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ appointment?: string }> }) {
  await requireManager();
  const { appointment: aptId } = await searchParams;
  const [services, products, staff, apt] = await Promise.all([db.list("services"), db.list("inventory"), db.list("staff"), aptId ? db.get("appointments", aptId) : null]);
  const guest = apt ? await db.get("customers", apt.customer_id) : null;
  const billable = apt && !apt.invoice_id && apt.status !== "cancelled" && apt.status !== "no_show";

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Front desk"
        title="New bill"
        sub={billable && guest ? `For ${guest.name}'s ${apt.service_name} booking — check the lines, then save.` : "Saving the bill numbers it, takes products off the shelf and credits the guest's loyalty points."}
        actions={<Link className="btn" href="/invoices">All invoices</Link>}
      />
      {aptId && !billable && <div className="callout" role="alert" style={{ marginBottom: 16 }}>That appointment is already billed, cancelled or missing — this is a fresh bill.</div>}
      <InvoiceBuilder
        today={istToday()}
        services={services.filter((s) => s.is_active !== false).map((s) => ({ key: `service:${s.id}`, name: s.name, price: s.price }))}
        products={products.map((p) => ({ key: `inventory:${p.id}`, name: p.name, price: p.price, stock: p.quantity }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        prefill={billable && guest ? { appointment_id: apt.id, name: guest.name, phone: guest.phone, lines: [{ key: `service:${apt.service_id}`, staff_id: apt.staff_id }] } : undefined}
      />
    </>
  );
}
