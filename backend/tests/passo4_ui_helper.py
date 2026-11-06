# Helper for Passo 4 UI tests: `setup` creates TEST_ data (prints JSON), `cleanup` deletes exactly what setup created.
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from bson import ObjectId

sys.path.insert(0, str(Path(__file__).parent))
import test_passo4_live as T  # noqa: E402

STATE = Path("/tmp/passo4_ui_state.json")


def setup():
    doc = T.login("medico@mantmed.it", "Auscula-Studio-2026")
    cf = T.make_cf()
    cf2 = T.make_cf()
    P = T.mk_user("uip", [cf])
    A = T.mk_user("uia", [cf])
    L = T.mk_user("uil", [])
    r = doc.post(f"{T.BASE}/patients", json={"name": f"TEST_Adulto {T.TAG}", "birth_date": T.born_years_ago(30, 0), "sex": "M", "fiscal_code": cf,
                                            "patient_email": P["email"], "guardian_email": A["email"]})
    pid = r.json()["id"]
    r2 = doc.post(f"{T.BASE}/patients", json={"name": f"TEST_Quasi18 {T.TAG}", "birth_date": T.born_years_ago(18, -10), "sex": "F", "fiscal_code": cf2,
                                             "guardian_email": A["email"]})
    pid2 = r2.json()["id"]
    st = {"users": [str(u) for u in T.S["users"]], "patients": [pid, pid2], "P": P, "A": A, "L": L, "pw": T.PW, "pid": pid, "pid2": pid2}
    STATE.write_text(json.dumps(st))
    print(json.dumps(st))


def cleanup():
    st = json.loads(STATE.read_text())
    DB = T.DB
    print(DB.users.delete_many({"_id": {"$in": [ObjectId(u) for u in st["users"]]}}).deleted_count,
          DB.patients.delete_many({"_id": {"$in": [ObjectId(p) for p in st["patients"]]}}).deleted_count,
          DB.access_grants.delete_many({"patient_id": {"$in": st["patients"]}}).deleted_count,
          DB.sessions.delete_many({"uid": {"$in": st["users"]}}).deleted_count)


if __name__ == "__main__":
    {"setup": setup, "cleanup": cleanup}[sys.argv[1]]()
