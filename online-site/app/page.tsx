import { all } from "../lib/db";
import type { EmailDraftRow, FreeDayRow, InvoiceRow, ReleaseRow } from "../lib/types";
import { extensionDays, formatDate, isCosco, splitContainers } from "../lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "当前船舶 · Shipowner Invoice Manager" };

type ArchiveRow = { vessel_name: string };
type OwnerSummary = { name: string; email: string; containers: string[] };
type VesselSummary = {
  vessel: string;
  eta: string;
  invoices: InvoiceRow[];
  owners: OwnerSummary[];
  coscoCount: number;
  coscoDrafts: number;
  containerCount: number;
  releasedCount: number;
  pendingRelease: number;
  extensionCount: number;
};

export default async function Home() {
  const [invoices, archives, drafts, plans, releases] = await Promise.all([
    all<InvoiceRow>("SELECT * FROM invoices ORDER BY eta, vessel_name, owner_name, id"),
    all<ArchiveRow>("SELECT vessel_name FROM vessel_archives"),
    all<EmailDraftRow>("SELECT * FROM email_drafts WHERE draft_type='cosco_request'"),
    all<FreeDayRow>("SELECT * FROM container_free_days"),
    all<ReleaseRow>("SELECT * FROM container_releases"),
  ]);
  const archived = new Set(archives.map((row) => row.vessel_name));
  const vessels = buildVessels(invoices, drafts, plans, releases).filter((group) => !archived.has(group.vessel));
  const pendingRelease = vessels.reduce((sum, vessel) => sum + vessel.pendingRelease, 0);
  const extensionNeeded = vessels.reduce((sum, vessel) => sum + vessel.extensionCount, 0);
  const missingEta = vessels.filter((vessel) => !vessel.eta).length;
  const pendingCoscoDrafts = vessels.reduce((sum, vessel) => sum + Math.max(0, vessel.coscoCount - vessel.coscoDrafts), 0);
  return (
    <main>
      <section className="hero">
        <div><p className="eyebrow">CURRENT VESSELS · ONLINE</p><h1>当前船舶账单汇总</h1><p>Windows 和 Mac 共用同一份在线数据。按 ETA 从早到晚排列，点击船名进入汇总。</p></div>
        <div className="heroActions"><a className="button secondary" href="/api/export">导出全部 Excel</a><a className="button" href="/upload">＋ 继续录入账单</a></div>
      </section>
      <section className="card summaryBar" aria-label="当前工作待办">
        <div><span className="muted">待 Release</span><strong className="grandTotal">{pendingRelease} 个柜</strong></div>
        <div><span className="muted">需要延期</span><strong className="grandTotal">{extensionNeeded} 个柜</strong></div>
        <div><span className="muted">缺少 ETA</span><strong className="grandTotal">{missingEta} 条船</strong></div>
        <div><span className="muted">COSCO 草稿待保存</span><strong className="grandTotal">{pendingCoscoDrafts} 封</strong></div>
      </section>
      <section className="card" id="current">
        <div className="sectionTitle"><h2>当前船舶</h2><span>{vessels.length} 条船</span></div>
        {vessels.length ? <div className="tableWrap"><table>
          <thead><tr><th>ETA</th><th>船舶</th><th>船东</th><th>集装箱号（按船东）</th><th>账单</th><th>工作状态</th><th>COSCO 索账</th><th>到港状态</th><th></th></tr></thead>
          <tbody>{vessels.map((vessel) => <tr key={vessel.vessel}>
            <td><strong>{formatDate(vessel.eta)}</strong></td>
            <td><a className="vessel" href={`/group?vessel=${encodeURIComponent(vessel.vessel)}`}>{vessel.vessel || "待补充船名"}</a></td>
            <td>{vessel.owners.length}</td>
            <td className="containerSummary">{vessel.owners.map((owner) => <div key={`${owner.name}-${owner.email}`}><strong>{owner.name || "待补充船东"}：</strong>{owner.containers.join(", ") || "待补充"}</div>)}</td>
            <td><strong>{vessel.invoices.length}</strong></td>
            <td><div className="summaryBadges">
              {vessel.containerCount ? <em className={`badge ${vessel.pendingRelease ? "warning" : "success"}`}>Release {vessel.releasedCount}/{vessel.containerCount}</em> : <em className="badge warning">待补箱号</em>}
              {vessel.extensionCount > 0 && <em className="badge warning">需延长 {vessel.extensionCount} 个柜</em>}
              {!vessel.eta && <em className="badge warning">待补 ETA</em>}
            </div></td>
            <td>{vessel.coscoCount ? <span className={`status ${vessel.coscoDrafts === vessel.coscoCount ? "success" : "neutral"}`}>{vessel.coscoDrafts}/{vessel.coscoCount} 已保存</span> : "无需索要"}</td>
            <td><span className={`status ${arrivalClass(vessel.eta)}`}>{arrivalLabel(vessel.eta)}</span></td>
            <td><div className="rowActions"><a href={`/api/export?vessel=${encodeURIComponent(vessel.vessel)}`}>Excel</a><form action="/api/group/archive" method="post"><input type="hidden" name="vessel" value={vessel.vessel} /><button className="linkDanger" type="submit">结束</button></form></div></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty">暂无当前船舶。<br /><a href="/upload">上传第一份账单</a></div>}
      </section>
    </main>
  );
}

function buildVessels(invoices: InvoiceRow[], drafts: EmailDraftRow[], plans: FreeDayRow[], releases: ReleaseRow[]) {
  const map = new Map<string, VesselSummary>();
  for (const invoice of invoices) {
    const key = invoice.vessel_name || "待补充船名";
    let group = map.get(key);
    if (!group) {
      group = { vessel: key, eta: invoice.eta, invoices: [], owners: [], coscoCount: 0, coscoDrafts: 0, containerCount: 0, releasedCount: 0, pendingRelease: 0, extensionCount: 0 };
      map.set(key, group);
    }
    group.invoices.push(invoice);
    if (!group.eta && invoice.eta) group.eta = invoice.eta;
    let owner = group.owners.find((item) => item.name === invoice.owner_name && item.email === invoice.owner_email);
    if (!owner) {
      owner = { name: invoice.owner_name, email: invoice.owner_email, containers: [] };
      group.owners.push(owner);
      if (isCosco(invoice.owner_name)) group.coscoCount += 1;
    }
    for (const container of splitContainers(invoice.container_no)) if (!owner.containers.includes(container)) owner.containers.push(container);
  }

  for (const group of map.values()) {
    const containerKeys = group.owners.flatMap((owner) => owner.containers.map((container) => `${owner.name}\u0000${container}`));
    const releasedKeys = new Set(releases
      .filter((row) => row.vessel_name === group.vessel && Boolean(row.released))
      .map((row) => `${row.owner_name}\u0000${row.container_no}`));
    group.containerCount = containerKeys.length;
    group.releasedCount = containerKeys.filter((key) => releasedKeys.has(key)).length;
    group.pendingRelease = Math.max(0, group.containerCount - group.releasedCount);
    group.extensionCount = plans.filter((row) =>
      row.vessel_name === group.vessel &&
      containerKeys.includes(`${row.owner_name}\u0000${row.container_no}`) &&
      extensionDays(row.last_free_day, row.pickup_date) > 0,
    ).length;
    group.coscoDrafts = group.owners.filter((owner) =>
      isCosco(owner.name) && drafts.some((draft) =>
        draft.vessel_name === group.vessel &&
        draft.owner_name === owner.name &&
        draft.owner_email === owner.email,
      ),
    ).length;
  }
  return Array.from(map.values()).sort((a, b) => (a.eta || "9999-99-99").localeCompare(b.eta || "9999-99-99") || a.vessel.localeCompare(b.vessel));
}

function arrivalLabel(eta: string) {
  if (!eta) return "未设置 ETA";
  const days = Math.ceil((Date.parse(`${eta}T00:00:00Z`) - Date.now()) / 86400000);
  if (days < 0) return `已到港 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到港";
  return `${days} 天后到港`;
}
function arrivalClass(eta: string) { if (!eta) return "neutral"; return Date.parse(`${eta}T23:59:59Z`) < Date.now() ? "late" : ""; }
