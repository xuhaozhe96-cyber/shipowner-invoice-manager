import type { EmailDraftRow, FreeDayRow, InvoiceRow, PaymentProofRow, ReleaseRow } from "./types";
import { extensionDays, isCosco, splitContainers, totals } from "./utils";

export function ownerGroups(invoices: InvoiceRow[], plans: FreeDayRow[], releases: ReleaseRow[], proofs: PaymentProofRow[], drafts: EmailDraftRow[]) {
  const groups = new Map<string, ReturnType<typeof newGroup>>();
  for (const invoice of invoices) {
    const key = `${invoice.owner_name}\u0000${invoice.owner_email}`;
    let group = groups.get(key);
    if (!group) { group = newGroup(invoice.owner_name, invoice.owner_email); groups.set(key, group); }
    group.invoices.push(invoice);
    const numbers = splitContainers(invoice.container_no);
    for (const number of numbers.length ? numbers : ["待补充箱号"]) {
      let container = group.containerMap.get(number);
      if (!container) { container = { containerNo:number, invoices:[] as InvoiceRow[], blNos:[] as string[], sizes:[] as string[], released:false, lastFreeDay:"", pickupDate:"", extensionDays:0 }; group.containerMap.set(number,container); }
      container.invoices.push(invoice);
      if (invoice.bl_no && !container.blNos.includes(invoice.bl_no)) container.blNos.push(invoice.bl_no);
      if (invoice.container_size && !container.sizes.includes(invoice.container_size)) container.sizes.push(invoice.container_size);
    }
  }
  for (const group of groups.values()) {
    group.proofs = proofs.filter((proof) => proof.owner_name === group.ownerName);
    group.drafts = drafts.filter((draft) => draft.owner_name === group.ownerName && draft.owner_email === group.ownerEmail);
    for (const container of group.containerMap.values()) {
      const plan = plans.find((row) => row.owner_name === group.ownerName && row.container_no === container.containerNo);
      const release = releases.find((row) => row.owner_name === group.ownerName && row.container_no === container.containerNo);
      container.lastFreeDay = plan?.last_free_day || ""; container.pickupDate = plan?.pickup_date || ""; container.extensionDays = extensionDays(container.lastFreeDay, container.pickupDate); container.released = Boolean(release?.released);
    }
    group.containers = Array.from(group.containerMap.values()).map((container) => ({...container, totals:totals(container.invoices)}));
    group.totals = totals(group.invoices); group.releasedCount = group.containers.filter((container)=>container.released).length; group.extensionCount = group.containers.filter((container)=>container.extensionDays>0).length; group.extensionInvoiceCount = group.invoices.filter((invoice)=>invoice.invoice_category==="last_free_day_extension").length;
    const lastDays = new Set(group.containers.map((container)=>container.lastFreeDay)); const pickups = new Set(group.containers.map((container)=>container.pickupDate)); group.bulkLastFreeDay = lastDays.size===1 ? Array.from(lastDays)[0] : ""; group.bulkPickupDate = pickups.size===1 ? Array.from(pickups)[0] : "";
  }
  return Array.from(groups.values());
}

function newGroup(ownerName:string, ownerEmail:string) {
  return { ownerName, ownerEmail, isCosco:isCosco(ownerName), invoices:[] as InvoiceRow[], containerMap:new Map<string,{containerNo:string;invoices:InvoiceRow[];blNos:string[];sizes:string[];released:boolean;lastFreeDay:string;pickupDate:string;extensionDays:number}>(), containers:[] as Array<{containerNo:string;invoices:InvoiceRow[];blNos:string[];sizes:string[];released:boolean;lastFreeDay:string;pickupDate:string;extensionDays:number;totals:{currency:string;amount:string}[]}>, proofs:[] as PaymentProofRow[], drafts:[] as EmailDraftRow[], totals:[] as {currency:string;amount:string}[], releasedCount:0, extensionCount:0, extensionInvoiceCount:0, bulkLastFreeDay:"", bulkPickupDate:"" };
}
