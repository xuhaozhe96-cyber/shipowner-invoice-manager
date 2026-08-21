"""One-time migration helper for moving the local SQLite data and private files online."""
from __future__ import annotations
import json, mimetypes, os, sqlite3, sys, uuid
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent; DB=ROOT/"data"/"shipowner_invoices.db"; UPLOADS=ROOT/"data"/"uploads"; PROOFS=ROOT/"data"/"payment_proofs"

def rows(db:sqlite3.Connection,table:str):
    try:return [dict(row) for row in db.execute(f"SELECT * FROM {table}").fetchall()]
    except sqlite3.OperationalError:return []

def post_json(url:str,secret:str,payload:dict):
    request=Request(url+"/api/migrate/data",data=json.dumps(payload).encode(),headers={"content-type":"application/json","x-migration-secret":secret},method="POST")
    with urlopen(request,timeout=120) as response: print(response.read().decode())

def post_file(url:str,secret:str,kind:str,record_id:int,path:Path,content_type:str):
    boundary="----Shipowner"+uuid.uuid4().hex; data=path.read_bytes(); parts=[]
    for name,value in (("kind",kind),("id",str(record_id))):parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: {content_type}\r\n\r\n".encode()+data+b"\r\n");parts.append(f"--{boundary}--\r\n".encode());body=b"".join(parts)
    request=Request(url+"/api/migrate/file",data=body,headers={"content-type":f"multipart/form-data; boundary={boundary}","x-migration-secret":secret},method="POST")
    with urlopen(request,timeout=120) as response: response.read()

def main():
    if len(sys.argv)!=3:raise SystemExit("Usage: python migrate_online.py https://site.example MIGRATION_SECRET")
    url=sys.argv[1].rstrip("/");secret=sys.argv[2]
    with sqlite3.connect(DB) as db:
        db.row_factory=sqlite3.Row
        invoices=rows(db,"invoices");proofs=rows(db,"payment_proofs")
        old_drafts=rows(db,"email_drafts");release_drafts=rows(db,"cosco_release_drafts");extension_drafts=rows(db,"free_day_extension_drafts")
        drafts=[{**row,"draft_type":"cosco_request"} for row in old_drafts]+[{**row,"draft_type":"payment_release"} for row in release_drafts]+[{**row,"draft_type":"free_day_extension"} for row in extension_drafts]
        learning=[{**row,"invoice_id":row.get("invoice_id",0),"fields_json":row.get("fields_json","{}"),"template_signature":row.get("template_signature","")} for row in rows(db,"invoice_learning_examples")]
        payload={"invoices":invoices,"vessel_archives":rows(db,"vessel_archives"),"container_releases":rows(db,"container_releases"),"container_free_days":rows(db,"container_free_days"),"payment_proofs":proofs,"email_drafts":drafts,"learning_examples":learning}
    post_json(url,secret,payload)
    for invoice in invoices:
        path=UPLOADS/invoice.get("stored_filename","")
        if path.is_file():post_file(url,secret,"invoice",invoice["id"],path,"application/pdf")
    for proof in proofs:
        path=PROOFS/proof.get("stored_filename","")
        if path.is_file():post_file(url,secret,"payment_proof",proof["id"],path,mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    print(f"Migrated {len(invoices)} invoices and {len(proofs)} payment proofs.")

if __name__=="__main__":main()
