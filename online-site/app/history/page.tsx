import { all } from "../../lib/db";
import type { InvoiceRow } from "../../lib/types";
import { formatDate, totals } from "../../lib/utils";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const rows = await all<InvoiceRow & { archived_at: string }>(`SELECT i.*, a.archived_at FROM invoices i JOIN vessel_archives a ON a.vessel_name=i.vessel_name ORDER BY a.archived_at DESC, i.owner_name, i.id`);
  const groups = new Map<string, InvoiceRow[]>();
  for (const row of rows) groups.set(row.vessel_name, [...(groups.get(row.vessel_name) ?? []), row]);
  return <main><div className="pageHeading"><div><p className="eyebrow">HISTORY</p><h1>历史记录</h1><p>已结束的船舶仍可查看、导出或恢复到当前列表。</p></div><a href="/">返回当前船舶</a></div><section className="card"><div className="sectionTitle"><h2>已结束船舶</h2><span>{groups.size} 条船</span></div>{groups.size ? <div className="tableWrap"><table><thead><tr><th>ETA</th><th>船舶</th><th>账单</th><th>合计</th><th></th></tr></thead><tbody>{Array.from(groups, ([vessel, invoices]) => <tr key={vessel}><td>{formatDate(invoices.find((i) => i.eta)?.eta || "")}</td><td><a className="vessel" href={`/group?vessel=${encodeURIComponent(vessel)}`}>{vessel}</a></td><td>{invoices.length}</td><td>{totals(invoices).map((total) => <div key={total.currency}><strong>{total.currency} {total.amount}</strong></div>)}</td><td><form action="/api/group/restore" method="post"><input type="hidden" name="vessel" value={vessel} /><button className="secondary" type="submit">恢复</button></form></td></tr>)}</tbody></table></div> : <div className="empty">暂无历史记录。</div>}</section></main>;
}
