"use client";
import { useId, useRef, useState } from "react";

export function PaymentProofUpload({ vessel, owner, defaultDate }: { vessel: string; owner: string; defaultDate: string }) {
  const inputId = useId(); const inputRef = useRef<HTMLInputElement>(null); const [count, setCount] = useState(0);
  function paste(event: React.ClipboardEvent<HTMLDivElement>) {
    const images = Array.from(event.clipboardData.items).filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (!images.length || !inputRef.current) return;
    const transfer = new DataTransfer(); Array.from(inputRef.current.files ?? []).forEach((file) => transfer.items.add(file));
    images.forEach((file, index) => transfer.items.add(new File([file], `clipboard-${Date.now()}-${index + 1}.${file.type.split("/")[1]?.replace("jpeg","jpg") || "png"}`, { type: file.type })));
    inputRef.current.files = transfer.files; setCount(transfer.files.length); event.preventDefault();
  }
  return <form className="proofUpload" action="/api/payment-proofs" method="post" encType="multipart/form-data">
    <input type="hidden" name="vessel" value={vessel} /><input type="hidden" name="owner" value={owner} />
    <label><span>付款日期</span><input type="date" name="payment_date" defaultValue={defaultDate} /></label>
    <div className="proofFileControls"><label htmlFor={inputId}><span>付款截图（可多选）</span><input ref={inputRef} id={inputId} type="file" name="proof_files" accept="image/png,image/jpeg,image/webp,image/gif" multiple required onChange={(event) => setCount(event.target.files?.length ?? 0)} /></label>
      <div className={`pasteZone ${count ? "hasFiles" : ""}`} tabIndex={0} onPaste={paste}><strong>点击这里，再按 Ctrl+V 或 Command+V 粘贴截图</strong><small>也可使用上面的文件选择；支持多张图片</small><span>{count ? `已选择 ${count} 张` : "尚未选择图片"}</span></div></div>
    <button className="secondary" type="submit">上传付款截图</button>
  </form>;
}
