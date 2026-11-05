"""Check: does a doctor attachment reply supersede pending MantAI drafts like a text reply does?"""
import subprocess, requests
from dotenv import dotenv_values
B = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
TID = "6aebd06cd17bbe05b0969adb"
print(subprocess.check_output(["python", "/app/tests/iter69_insert_draft.py", TID]).decode().strip())
d = requests.Session()
d.post(f"{B}/api/auth/login", json={"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"}).raise_for_status()
print("draft before:", bool(d.get(f"{B}/api/messages/threads/{TID}").json()["ai_draft"]))
r = d.post(f"{B}/api/messages/threads/{TID}/attachments", files={"file": ("TEST_b.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}, data={"body": "TEST_ attach reply"})
print("attach", r.status_code, "draft after attach:", r.json()["ai_draft"])
r = d.post(f"{B}/api/messages/threads/{TID}/messages", json={"body": "TEST_ text reply"})
print("draft after text reply:", r.json()["ai_draft"])
