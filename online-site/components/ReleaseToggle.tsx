"use client";
import { useState } from "react";

export function ReleaseToggle({ vessel, owner, container, initial }: { vessel: string; owner: string; container: string; initial: boolean }) {
  const [released, setReleased] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function update(next: boolean) {
    setReleased(next); setSaving(true);
    const body = new FormData(); body.set("vessel", vessel); body.set("owner", owner); body.set("container", container); body.set("released", next ? "1" : "0");
    try { const response = await fetch("/api/container/release", { method: "POST", body }); if (!response.ok) throw new Error(); }
    catch { setReleased(!next); alert("Release 状态保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <label className={`releaseToggle ${released ? "released" : ""}`}><input type="checkbox" checked={released} disabled={saving} onChange={(event) => update(event.target.checked)} /><span>{released ? "已 Release" : "未 Release"}</span></label>;
}
