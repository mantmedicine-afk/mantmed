"""Helper: create a fresh AI draft consultation for Aurora Ricci (bodychart UI tests)."""
import requests
from dotenv import dotenv_values
B = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
s.post(f"{B}/api/auth/login", json={"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"}).raise_for_status()
t = ("TEST_BC3 Bambina di 4 anni con eruzione cutanea pruriginosa. All'esame obiettivo eruzione maculo-papulare sul gomito destro, "
     "nevo di 3 millimetri sulla guancia sinistra, livido sul ginocchio sinistro. Faringe iperemica. Diagnosi dermatite atopica.")
r = s.post(f"{B}/api/consultations", json={"patient_name": "Aurora Ricci", "patient_id": "6ad86e64c06e50ff4cd67d1e", "transcript": t, "duration_sec": 60}, timeout=180)
print(r.status_code, r.json().get("id"), r.json().get("status"), r.json().get("verification_status") if r.ok else r.text[:300])
