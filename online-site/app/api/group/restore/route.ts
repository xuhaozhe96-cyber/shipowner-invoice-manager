import { run } from "../../../../lib/db";
export async function POST(request: Request) { const form=await request.formData(); const vessel=String(form.get("vessel")||"").trim(); if(vessel) await run("DELETE FROM vessel_archives WHERE vessel_name=?",[vessel]); return Response.redirect(new URL("/",request.url),303); }
