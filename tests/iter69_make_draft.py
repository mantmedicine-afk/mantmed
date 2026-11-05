"""Helper: parent creates a TEST_ clinical thread so MantAI may generate an in_attesa draft; prints thread id + draft state."""
import sys, time, requests
from pathlib import Path
from dotenv import dotenv_values
from pymongo import MongoClient
env = dotenv_values("/app/frontend/.env"); benv = dotenv_values("/app/backend/.env")
B = env["REACT_APP_BACKEND_URL"].rstrip("/")
DB = MongoClient(benv["MONGO_URL"])[benv["DB_NAME"]]
if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    from bson import ObjectId
    for tid in sys.argv[2:]:
        DB.msg_files.delete_many({"thread_id": tid}); DB.messages.delete_many({"thread_id": tid})
        DB.ai_reply_drafts.delete_many({"thread_id": tid}); DB.notifications.delete_many({"ref": tid})
        DB.threads.delete_one({"_id": ObjectId(tid)})
        print("cleaned", tid)
    sys.exit()
s = requests.Session()
s.post(f"{B}/api/auth/login", json={"email": "genitore.demo@example.com", "password": "Portale-Demo-2026"}).raise_for_status()
k = s.get(f"{B}/api/portal/me").json()["children"][0]
r = s.post(f"{B}/api/portal/threads", json={"patient_id": k["patient"]["id"], "owner_id": k["doctor"]["id"], "kind": "clinico",
                                            "subject": "TEST_UI tosse", "body": "TEST_UI Buongiorno, Aurora ha un po' di tosse secca da due giorni senza febbre. Possiamo darle uno sciroppo?"})
r.raise_for_status()
tid = r.json()["id"]
print("thread", tid)
for _ in range(25):
    time.sleep(3)
    d = DB.ai_reply_drafts.find_one({"thread_id": tid})
    if d:
        print("draft", d["status"], d.get("ai_failed")); break
else:
    print("no draft generated")
