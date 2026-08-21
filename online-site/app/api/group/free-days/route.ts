import { all, nowIso, run } from "../../../../lib/db";
import type { InvoiceRow } from "../../../../lib/types";
import { splitContainers } from "../../../../lib/utils";
export async function POST(request: Request) {
  const form=await request.formData(); const vessel=String(form.get("vessel")||"").trim(); const owner=String(form.get("owner")||"").trim(); const scope=String(form.get("scope")||"container"); const selected=String(form.get("container")||"").trim(); const last=String(form.get("last_free_day")||""); const pickup=String(form.get("pickup_date")||"");
  const invoices=await all<InvoiceRow>("SELECT * FROM invoices WHERE vessel_name=? AND owner_name=?",[vessel,owner]); const valid=Array.from(new Set(invoices.flatMap((invoice)=>splitContainers(invoice.container_no)))); const targets=scope==="owner"?valid:[selected];
  for(const container of targets.filter((item)=>valid.includes(item))) await run(`INSERT INTO container_free_days (vessel_name,owner_name,container_no,last_free_day,pickup_date,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(vessel_name,owner_name,container_no) DO UPDATE SET last_free_day=excluded.last_free_day,pickup_date=excluded.pickup_date,updated_at=excluded.updated_at`,[vessel,owner,container,last,pickup,nowIso()]);
  return Response.redirect(new URL(`/group?vessel=${encodeURIComponent(vessel)}&saved=free-days`,request.url),303);
}
