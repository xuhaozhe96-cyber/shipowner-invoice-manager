import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app as app_module
from pypdf import PdfWriter


class AppTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.db_patch = patch.object(app_module, "DATABASE", root / "test.db")
        self.upload_patch = patch.object(app_module, "UPLOAD_DIR", root / "uploads")
        self.proof_patch = patch.object(app_module, "PAYMENT_PROOF_DIR", root / "payment_proofs")
        self.db_patch.start()
        self.upload_patch.start()
        self.proof_patch.start()
        app_module.init_db()
        app_module.app.config.update(TESTING=True)
        self.client = app_module.app.test_client()

    def tearDown(self):
        self.upload_patch.stop()
        self.proof_patch.stop()
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_extract_fields(self):
        text = """Vessel: EVER GIVEN
Voyage No: 116E
ETA: 18/08/2026
Invoice No: INV-001
Shipowner: Example Shipping Ltd
Email: ops@example.com
Container No: MSKU1234567
B/L No: BL9988
Total Amount: USD 1,250.50"""
        fields = app_module.extract_fields(text)
        self.assertEqual(fields["vessel_name"], "EVER GIVEN")
        self.assertEqual(fields["voyage_no"], "116E")
        self.assertEqual(fields["eta"], "2026-08-18")
        self.assertEqual(fields["container_no"], "MSKU1234567")
        self.assertEqual(fields["amount"], "1,250.50")
        self.assertEqual(fields["currency"], "USD")

    def test_learns_confirmed_fields_from_similar_pdf_layout(self):
        first_text = """GLOBAL LINE BILLING
10000001INVOICE NUMBER
SAILING DETAILS
01 Aug 2026OCEAN STAR 001W
ABCU1234567 40HQ GOODS
TOTAL GBP 305.50"""
        second_text = """GLOBAL LINE BILLING
10000002INVOICE NUMBER
SAILING DETAILS
09 Sep 2026PACIFIC MOON 002W
MSCU7654321 40HQ GOODS
TOTAL GBP 410.00"""
        with app_module.db_session() as db:
            cursor = db.execute(
                """INSERT INTO invoices (
                       source_filename, stored_filename, raw_text, vessel_name, invoice_no,
                       owner_name, owner_email, container_no, container_size, amount, currency,
                       status, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "confirmed.pdf", "confirmed.pdf", first_text, "OCEAN STAR 001W", "10000001",
                    "GLOBAL LINE", "billing@global.test", "ABCU1234567", "40HQ", "305.50", "GBP",
                    "已核对", "2026-08-01", "2026-08-01",
                ),
            )
            invoice = db.execute("SELECT * FROM invoices WHERE id = ?", (cursor.lastrowid,)).fetchone()
            corrected = {field: invoice[field] or "" for field in app_module.TEMPLATE_LEARN_FIELDS}
            learned_count = app_module.remember_invoice_learning(db, invoice, corrected)
            initial = {field: "" for field in app_module.TEMPLATE_LEARN_FIELDS}
            learned, note = app_module.apply_learned_corrections(db, second_text, initial)

        self.assertGreaterEqual(learned_count, 6)
        self.assertEqual(learned["vessel_name"], "PACIFIC MOON 002W")
        self.assertEqual(learned["invoice_no"], "10000002")
        self.assertEqual(learned["container_no"], "MSCU7654321")
        self.assertEqual(learned["container_size"], "40HQ")
        self.assertEqual(learned["amount"], "410.00")
        self.assertEqual(learned["owner_name"], "GLOBAL LINE")
        self.assertIn("人工校正自动填写", note)

    def test_extract_cosco_column_order_invoice(self):
        text = """ORIGINAL
COSCO SHIPPING Lines (UK) Limited 1PAGE NO.
3106910924INVOICE NO.
PORT OF DISCHARGE FINAL DESTINATIONSHIP TO / BY
Felixstowe FelixstoweApex Global Logistics (NL) BV
VESSEL VOYAGE BOUND ARRIVED/DEPARTED
04 Aug 2026XIN LIAN YUN GANG 009W
OOCU8098321 40HQ WALLPAPER 5280 KG 68 CBM
VATBASIS RATE GBP
1.00000
1.00000
1.00000
1.00000
Carrier Security Charge
UK Lo-Lo(lift on-lift off) Charge
DEST TRML HANDLG
DEST. DOC FEE
SUB-TOTAL
VAT Summary
GBP
GBP
GBP
GBP
1
1
1
1
1.5000
80.0000
189.0000
35.0000
1.50
80.00
189.00
35.00
GBP 305.50AMOUNT DUE
Please send payment remittance to: creditcontrol@coscoshipping.co.uk"""
        fields = app_module.extract_fields(text)
        self.assertEqual(fields["vessel_name"], "XIN LIAN YUN GANG 009W")
        self.assertEqual(fields["voyage_no"], "")
        self.assertEqual(fields["owner_name"], "COSCO SHIPPING Lines")
        self.assertEqual(fields["owner_email"], "Releases@coscoshipping.co.uk")
        self.assertEqual(fields["invoice_no"], "3106910924")
        self.assertEqual(fields["invoice_date"], "")
        self.assertEqual(fields["port_of_discharge"], "Felixstowe")
        self.assertEqual(fields["container_no"], "OOCU8098321")
        self.assertEqual(fields["container_size"], "40HQ")
        self.assertEqual(fields["amount"], "305.50")
        self.assertEqual(fields["currency"], "GBP")
        self.assertIn("Carrier Security Charge | £1.5", fields["charge_details"])
        self.assertIn("DEST. DOC FEE | £35", fields["charge_details"])

    def test_dashboard_and_excel_export(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        response = self.client.get("/export.xlsx")
        self.assertEqual(response.status_code, 200)
        self.assertIn("spreadsheetml", response.content_type)

    def test_rejects_missing_upload(self):
        response = self.client.post("/upload", data={}, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("请选择至少一个 PDF".encode(), response.data)

    def test_duplicate_invoice_number_is_not_recorded_twice(self):
        invoice_text = """Invoice No: DUP-1001
Vessel: TEST VESSEL 001W
Container No: ABCU1234567
Total Amount: GBP 10.00"""
        with patch.object(app_module, "extract_pdf_text", return_value=(invoice_text, "")):
            response = self.client.post(
                "/upload",
                data={
                    "pdfs": [
                        (io.BytesIO(b"first-pdf"), "first.pdf"),
                        (io.BytesIO(b"second-pdf"), "second.pdf"),
                    ]
                },
                content_type="multipart/form-data",
                follow_redirects=True,
            )
        self.assertEqual(response.status_code, 200)
        self.assertIn("账单号 DUP-1001 已经存在".encode(), response.data)
        with app_module.db_session() as db:
            invoices = db.execute("SELECT * FROM invoices").fetchall()
        self.assertEqual(len(invoices), 1)
        self.assertEqual(invoices[0]["source_filename"], "first.pdf")
        self.assertEqual(len(list(app_module.UPLOAD_DIR.glob("*.pdf"))), 1)

        pending_path = app_module.UPLOAD_DIR / "pending-duplicate.pdf"
        pending_path.write_bytes(b"pending")
        with app_module.db_session() as db:
            cursor = db.execute(
                """INSERT INTO invoices (
                       source_filename, stored_filename, invoice_no, status, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    "pending.pdf", "pending-duplicate.pdf", "TEMP-1", "待校正",
                    "2026-08-10", "2026-08-10",
                ),
            )
            pending_id = cursor.lastrowid
        response = self.client.post(
            f"/invoice/{pending_id}",
            data={
                "vessel_name": "TEST VESSEL 001W", "voyage_no": "", "eta": "",
                "invoice_no": "DUP 1001", "invoice_date": "", "owner_name": "",
                "owner_email": "", "port_of_discharge": "", "container_no": "ABCU1234567",
                "container_size": "", "bl_no": "", "charge_details": "",
                "amount": "10.00", "currency": "GBP", "status": "待校正", "next": "save",
            },
            follow_redirects=True,
        )
        self.assertIn("已丢弃刚导入的重复记录".encode(), response.data)
        with app_module.db_session() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM invoices").fetchone()[0], 1)
        self.assertFalse(pending_path.exists())

    def test_vessels_sort_by_eta_and_archive_restore(self):
        with app_module.db_session() as db:
            db.execute(
                """INSERT INTO invoices
                   (source_filename, stored_filename, vessel_name, eta, owner_name, container_no, created_at, updated_at)
                   VALUES ('late.pdf', 'late.pdf', 'LATE SHIP', '2026-09-01', 'Owner B', 'TCLU7654321', '2026-08-01', '2026-08-01')"""
            )
            db.execute(
                """INSERT INTO invoices
                   (source_filename, stored_filename, vessel_name, eta, owner_name, container_no, created_at, updated_at)
                   VALUES ('early.pdf', 'early.pdf', 'EARLY SHIP', '2026-08-15', 'Owner A', 'MSKU1234567, OOCU8098321', '2026-08-01', '2026-08-01')"""
            )
        response = self.client.get("/")
        self.assertLess(response.data.index(b"EARLY SHIP"), response.data.index(b"LATE SHIP"))
        self.assertNotIn("最近录入的账单".encode(), response.data)
        self.assertIn("集装箱号（按船东）".encode(), response.data)
        self.assertIn(b"MSKU1234567, OOCU8098321", response.data)
        self.assertIn("Owner A：".encode(), response.data)
        self.assertIn("无需索要".encode(), response.data)
        non_cosco_group = self.client.get("/group?vessel=EARLY%20SHIP")
        self.assertIn("无需索要账单".encode(), non_cosco_group.data)
        self.assertNotIn("生成 COSCO 索账邮件".encode(), non_cosco_group.data)

        response = self.client.post(
            "/group/archive", data={"vessel": "EARLY SHIP"}, follow_redirects=True
        )
        self.assertNotIn(b"/group?vessel=EARLY+SHIP", response.data)
        history = self.client.get("/history")
        self.assertIn(b"EARLY SHIP", history.data)
        archived_group = self.client.get("/group?vessel=EARLY%20SHIP")
        self.assertIn("恢复到当前船舶".encode(), archived_group.data)

        response = self.client.post(
            "/group/restore", data={"vessel": "EARLY SHIP"}, follow_redirects=True
        )
        self.assertIn(b"EARLY SHIP", response.data)

    def test_upload_edit_group_and_draft_flow(self):
        pdf = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.write(pdf)
        pdf.seek(0)
        response = self.client.post(
            "/upload",
            data={"pdfs": (pdf, "船东账单.pdf")},
            content_type="multipart/form-data",
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("可能是扫描件".encode(), response.data)
        self.assertIn("船东账单.pdf".encode(), response.data)

        response = self.client.post(
            "/invoice/1",
            data={
                "vessel_name": "EVER GIVEN", "voyage_no": "116E", "eta": "2026-08-18",
                "invoice_no": "INV-001", "invoice_date": "2026-08-16", "owner_name": "COSCO SHIPPING Lines",
                "owner_email": "Releases@coscoshipping.co.uk", "container_no": "MSKU1234567",
                "port_of_discharge": "Felixstowe", "container_size": "40HQ",
                "charge_details": "Handling | £10", "bl_no": "BL9988",
                "amount": "1250.50", "currency": "USD",
                "status": "已核对", "next": "group",
            },
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("按船东汇总".encode(), response.data)

        with app_module.db_session() as db:
            db.execute(
                """INSERT INTO invoices (
                       source_filename, stored_filename, vessel_name, voyage_no, eta,
                       invoice_no, invoice_date, owner_name, owner_email, port_of_discharge,
                       container_no, container_size, bl_no, charge_details,
                       amount, currency, status, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "second.pdf", "second.pdf", "EVER GIVEN", "116E", "2026-08-18",
                    "INV-002", "2026-08-16", "COSCO SHIPPING Lines", "Releases@coscoshipping.co.uk", "Felixstowe",
                    "MSKU1234567", "40HQ", "BL9999", "Security | £100",
                    "100.00", "USD", "已核对", "2026-08-01", "2026-08-01",
                ),
            )

        grouped = self.client.get("/group?vessel=EVER%20GIVEN")
        self.assertIn(b'<details class="card owner-card">', grouped.data)
        self.assertIn("2 份账单".encode(), grouped.data)
        self.assertIn(b'class="container-edit-link" href="/invoice/1"', grouped.data)
        self.assertIn(b'class="invoice-edit-link" href="/invoice/1">INV-001</a>', grouped.data)
        self.assertIn(b'class="invoice-edit-link" href="/invoice/2">INV-002</a>', grouped.data)
        self.assertIn(b"BL9988, BL9999", grouped.data)
        self.assertIn(b"USD 1350.50", grouped.data)
        self.assertNotIn("本船全部账单明细".encode(), grouped.data)
        self.assertIn("付款截图".encode(), grouped.data)
        self.assertNotIn("老板付款截图".encode(), grouped.data)
        self.assertIn("Ctrl+V 粘贴截图".encode(), grouped.data)
        self.assertIn(b'multiple required', grouped.data)
        self.assertIn("生成付款后 Release 邮件".encode(), grouped.data)

        optional_release = self.client.get(
            "/group/release-draft?vessel=EVER%20GIVEN&owner=COSCO%20SHIPPING%20Lines&email=Releases%40coscoshipping.co.uk"
        )
        self.assertEqual(optional_release.status_code, 200)
        self.assertIn("付款截图：未上传（可选）".encode(), optional_release.data)
        self.assertIn("付款截图为可选凭证，不影响生成 Release 邮件".encode(), optional_release.data)

        release_status = self.client.post(
            "/container/release",
            data={
                "vessel": "EVER GIVEN", "owner": "COSCO SHIPPING Lines",
                "container": "MSKU1234567", "released": "1",
            },
        )
        self.assertEqual(release_status.status_code, 200)
        self.assertEqual(release_status.get_json(), {"ok": True, "released": True})
        grouped_after_release = self.client.get("/group?vessel=EVER%20GIVEN")
        self.assertIn("已 Release".encode(), grouped_after_release.data)
        self.assertIn("Release 1/1".encode(), grouped_after_release.data)

        cosco_draft = self.client.get(
            "/group/draft?vessel=EVER%20GIVEN&owner=COSCO%20SHIPPING%20Lines&email=Releases%40coscoshipping.co.uk"
        )
        self.assertIn(b"Release - EVER GIVEN // Cargo Move Ltd", cosco_draft.data)
        self.assertIn(b"BL Reference", cosco_draft.data)
        self.assertIn(b"18/08/2026", cosco_draft.data)
        self.assertIn(b"MSKU1234567", cosco_draft.data)
        self.assertNotIn(b"Good afternoon", cosco_draft.data)

        proof_response = self.client.post(
            "/group/payment-proof",
            data={
                "vessel": "EVER GIVEN", "owner": "COSCO SHIPPING Lines",
                "payment_date": "2026-08-17",
                "proof_files": [
                    (io.BytesIO(b"test-image-one"), "payment-1.png"),
                    (io.BytesIO(b"test-image-two"), "payment-2.jpg"),
                ],
            },
            content_type="multipart/form-data",
            follow_redirects=True,
        )
        self.assertIn("已为 COSCO SHIPPING Lines 保存 2 张付款截图".encode(), proof_response.data)
        self.assertIn("付款截图 2 张".encode(), proof_response.data)
        self.assertIn("生成付款后 Release 邮件".encode(), proof_response.data)
        proof_file_response = self.client.get("/payment-proof/1/file")
        self.assertEqual(proof_file_response.status_code, 200)
        proof_file_response.close()

        release_draft = self.client.get(
            "/group/release-draft?vessel=EVER%20GIVEN&owner=COSCO%20SHIPPING%20Lines&email=Releases%40coscoshipping.co.uk"
        )
        self.assertIn(b"Re: Release - EVER GIVEN // Remittance 1,350.50USD Cargo Move Ltd", release_draft.data)
        self.assertIn(b"Payment Date", release_draft.data)
        self.assertIn(b"17/08/2026", release_draft.data)
        self.assertIn(b"16/08/2026", release_draft.data)
        self.assertNotIn(b"External Email", release_draft.data)

        saved_release = self.client.post(
            "/group/release-draft?vessel=EVER%20GIVEN&owner=COSCO%20SHIPPING%20Lines&email=Releases%40coscoshipping.co.uk",
            data={"email_subject": "Release subject", "email_body": "Release body"},
            follow_redirects=True,
        )
        self.assertIn("付款后 Release 邮件草稿已保存".encode(), saved_release.data)

        response = self.client.post(
            "/group/eta",
            data={"vessel": "EVER GIVEN", "eta": "2026-08-18"},
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("ETA 已统一更新".encode(), response.data)

        response = self.client.post(
            "/group/draft?vessel=EVER%20GIVEN&owner=COSCO%20SHIPPING%20Lines&email=Releases%40coscoshipping.co.uk",
            data={"email_subject": "Test subject", "email_body": "Test body"},
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("汇总邮件草稿已保存".encode(), response.data)

        response = self.client.get("/group?vessel=EVER%20GIVEN")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"MSKU1234567", response.data)
        self.assertIn("索账草稿已保存".encode(), response.data)

    def test_last_free_day_email_and_extension_invoice_flow(self):
        with app_module.db_session() as db:
            db.execute(
                """INSERT INTO invoices (
                       source_filename, stored_filename, vessel_name, eta, invoice_no,
                       invoice_date, owner_name, owner_email, port_of_discharge,
                       container_no, container_size, bl_no, charge_details, amount,
                       currency, status, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "base.pdf", "base.pdf", "XIN LIAN YUN GANG 009W", "2026-08-04",
                    "3106910196", "2026-07-30", "COSCO SHIPPING Lines",
                    "Releases@coscoshipping.co.uk", "Felixstowe",
                    "FFAU3430543, TEMU6828873", "40HQ", "COSU9507964000",
                    "DEST TRML HANDLG | £189", "305.50", "GBP", "已核对",
                    "2026-08-01", "2026-08-01",
                ),
            )

        bulk_update = self.client.post(
            "/group/free-days",
            data={
                "vessel": "XIN LIAN YUN GANG 009W",
                "owner": "COSCO SHIPPING Lines",
                "scope": "owner",
                "last_free_day": "2026-08-10",
                "pickup_date": "2026-08-13",
            },
            follow_redirects=True,
        )
        self.assertIn("2 个集装箱统一更新免租期计划".encode(), bulk_update.data)
        self.assertIn("需延长 2 个柜".encode(), bulk_update.data)
        self.assertIn("延长 3 天".encode(), bulk_update.data)
        with app_module.db_session() as db:
            plans = db.execute("SELECT * FROM container_free_days ORDER BY container_no").fetchall()
        self.assertEqual(len(plans), 2)
        self.assertTrue(all(row["pickup_date"] == "2026-08-13" for row in plans))

        draft = self.client.get(
            "/group/free-day-draft?vessel=XIN%20LIAN%20YUN%20GANG%20009W&owner=COSCO%20SHIPPING%20Lines&email=Releases%40coscoshipping.co.uk"
        )
        self.assertEqual(draft.status_code, 200)
        self.assertIn(b"Last Free Day Extension - XIN LIAN YUN GANG 009W", draft.data)
        self.assertIn(b"FFAU3430543 extend to 13/08/2026", draft.data)
        self.assertIn(b"TEMU6828873 extend to 13/08/2026", draft.data)
        self.assertIn(b"Could you please also help extend", draft.data)

        extension_text = """Invoice No: EXT-3430543
Container No: FFAU3430543
Total Amount: GBP 120.00"""
        with patch.object(app_module, "extract_pdf_text", return_value=(extension_text, "")):
            uploaded = self.client.post(
                "/group/extension-invoice",
                data={
                    "vessel": "XIN LIAN YUN GANG 009W",
                    "owner": "COSCO SHIPPING Lines",
                    "email": "Releases@coscoshipping.co.uk",
                    "container_hint": "FFAU3430543",
                    "extension_pdfs": (io.BytesIO(b"extension-pdf"), "extension.pdf"),
                },
                content_type="multipart/form-data",
                follow_redirects=True,
            )
        self.assertIn("延长免租期账单 · 请重新审核".encode(), uploaded.data)
        with app_module.db_session() as db:
            extension = db.execute(
                "SELECT * FROM invoices WHERE invoice_no = 'EXT-3430543'"
            ).fetchone()
        self.assertIsNotNone(extension)
        self.assertEqual(extension["invoice_category"], "last_free_day_extension")
        self.assertEqual(extension["vessel_name"], "XIN LIAN YUN GANG 009W")
        self.assertEqual(extension["owner_name"], "COSCO SHIPPING Lines")
        self.assertEqual(extension["container_no"], "FFAU3430543")

        saved = self.client.post(
            f"/invoice/{extension['id']}",
            data={
                "vessel_name": "XIN LIAN YUN GANG 009W", "voyage_no": "", "eta": "2026-08-04",
                "invoice_no": "EXT-3430543", "invoice_date": "2026-08-11",
                "owner_name": "COSCO SHIPPING Lines", "owner_email": "Releases@coscoshipping.co.uk",
                "port_of_discharge": "Felixstowe", "container_no": "FFAU3430543",
                "container_size": "40HQ", "bl_no": "COSU9507964000",
                "charge_details": "Last Free Day Extension | £120", "amount": "120.00",
                "currency": "GBP", "status": "已核对", "next": "group",
            },
            follow_redirects=True,
        )
        self.assertIn(b"GBP 425.50", saved.data)
        self.assertIn("延期账单 1 份".encode(), saved.data)
        self.assertIn(">延期</span>".encode(), saved.data)

        single_update = self.client.post(
            "/group/free-days",
            data={
                "vessel": "XIN LIAN YUN GANG 009W", "owner": "COSCO SHIPPING Lines",
                "scope": "container", "container": "TEMU6828873",
                "last_free_day": "2026-08-10", "pickup_date": "2026-08-09",
            },
            follow_redirects=True,
        )
        self.assertIn("无需延长".encode(), single_update.data)
        self.assertIn("需延长 1 个柜".encode(), single_update.data)


if __name__ == "__main__":
    unittest.main()
