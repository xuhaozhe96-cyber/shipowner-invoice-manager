export const dynamic = "force-dynamic";

export default async function UploadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : "";
  return (
    <main>
      <div className="pageHeading"><div><p className="eyebrow">STEP 1</p><h1>上传船东账单 PDF</h1><p>可一次选择多份账单。系统先提取文字和关键字段，再让你逐份人工核对。</p></div><a href="/">返回当前船舶</a></div>
      {error && <div className="flash error">{error === "missing" ? "请选择至少一个 PDF。" : "没有可导入的 PDF，请检查文件格式和大小。"}</div>}
      <form className="card uploadCard" action="/api/invoices/upload" method="post" encType="multipart/form-data">
        <label className="filePicker">
          <span className="pdfIcon">PDF</span>
          <strong>选择一份或多份船东账单</strong>
          <small>每份文件不超过 20 MB；扫描件仍可保留并手工填写</small>
          <input type="file" name="pdfs" accept="application/pdf,.pdf" multiple required />
        </label>
        <div className="formActions"><button type="submit">上传并开始识别</button></div>
      </form>
    </main>
  );
}
