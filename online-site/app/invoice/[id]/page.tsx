import { first } from "../../../lib/db";
import type { InvoiceRow } from "../../../lib/types";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const invoice = await first<InvoiceRow>("SELECT * FROM invoices WHERE id = ?", [Number(id)]);
  if (!invoice) return <main><div className="card empty">没有找到这份账单。<br /><a href="/">返回首页</a></div></main>;
  return (
    <main>
      <div className="pageHeading"><div><p className="eyebrow">STEP 2</p><h1>核对识别结果</h1><p>{invoice.source_filename} · 所有字段均可修改</p></div><a className="button secondary" target="_blank" href={`/invoice/${invoice.id}/file`}>查看原始 PDF</a></div>
      {query.duplicate === "1" && <div className="notice">相同账单号已经存在，因此没有重复录入。</div>}
      {Number(query.uploaded || 0) > 0 && <div className="notice">已导入 {String(query.uploaded)} 份账单，请先核对这一份。</div>}
      {invoice.invoice_category === "last_free_day_extension" && <div className="notice warning"><strong>延长免租期账单 · 请重新审核</strong><br />请重点核对账单号、集装箱号、金额和费用明细；保存后会计入船东付款合计。</div>}
      {invoice.learning_note && <div className="notice"><strong>已使用校正学习</strong><br />{invoice.learning_note}</div>}
      {invoice.extraction_warning && <div className="flash error">{invoice.extraction_warning}</div>}
      <div className="split">
        <form className="card" action={`/api/invoices/${invoice.id}`} method="post">
          <div className="formGrid">
            <Field label="船名 Vessel" name="vessel_name" value={invoice.vessel_name} />
            <Field label="航次 Voyage" name="voyage_no" value={invoice.voyage_no} />
            <Field label="预计到港 ETA" name="eta" value={invoice.eta} type="date" />
            <Field label="账单号 Invoice No." name="invoice_no" value={invoice.invoice_no} />
            <Field label="账单日期 Invoice Date" name="invoice_date" value={invoice.invoice_date} type="date" />
            <Field label="船东 Owner / Carrier" name="owner_name" value={invoice.owner_name} />
            <Field label="船东邮箱" name="owner_email" value={invoice.owner_email} type="email" />
            <Field label="卸货港 Port of Discharge" name="port_of_discharge" value={invoice.port_of_discharge} />
            <Field label="集装箱尺寸" name="container_size" value={invoice.container_size} placeholder="40HQ" />
            <Field className="full" label="集装箱号（多个可用逗号分隔）" name="container_no" value={invoice.container_no} />
            <Field label="提单号 B/L No." name="bl_no" value={invoice.bl_no} />
            <label><span>账单状态</span><select name="status" defaultValue={invoice.status}>{["待校正","已核对","已归档","已完成"].map((status) => <option key={status}>{status}</option>)}</select></label>
            <Field label="金额" name="amount" value={invoice.amount} />
            <Field label="币种" name="currency" value={invoice.currency} placeholder="GBP" />
            <label className="full"><span>费用明细（每项一行）</span><textarea name="charge_details" rows={7} defaultValue={invoice.charge_details} /></label>
          </div>
          <div className="formActions"><button className="secondary" name="next" value="save">保存账单</button><button name="next" value="group">保存并进入船舶汇总</button></div>
        </form>
        <aside className="card rawText"><div className="sectionTitle"><h2>PDF 提取文本</h2></div><pre>{invoice.raw_text || "没有可显示的文本。请参考原始 PDF 手工填写。"}</pre></aside>
      </div>
    </main>
  );
}

function Field({ label, name, value, type = "text", placeholder = "", className = "" }: { label: string; name: string; value: string; type?: string; placeholder?: string; className?: string }) {
  return <label className={className}><span>{label}</span><input name={name} type={type} defaultValue={value} placeholder={placeholder} /></label>;
}
