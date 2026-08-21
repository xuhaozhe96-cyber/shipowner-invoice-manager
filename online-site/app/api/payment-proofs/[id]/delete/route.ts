import { bindings, first, run } from "../../../../../lib/db";
import type { PaymentProofRow } from "../../../../../lib/types";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;const row=await first<PaymentProofRow>("SELECT * FROM payment_proofs WHERE id=?",[Number(id)]);if(row){await bindings().FILES.delete(row.file_key);await run("DELETE FROM payment_proofs WHERE id=?",[Number(id)]);}return Response.redirect(new URL(`/group?vessel=${encodeURIComponent(row?.vessel_name||"")}`,request.url),303);}
