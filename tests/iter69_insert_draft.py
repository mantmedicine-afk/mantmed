"""Helper: insert a TEST_ in_attesa MantAI draft for a TEST_ thread (MantAI risposte disabled in demo, so no real drafts)."""
import sys
sys.path.insert(0, "/app/backend")
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from pymongo import MongoClient
import os
from crypto import seal_fields
DB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
tid = sys.argv[1]
t = DB.threads.find_one({"_id": __import__("bson").ObjectId(tid)})
m = DB.messages.find_one({"thread_id": tid, "from": "parent"})
now = datetime.now(timezone.utc).isoformat()
r = DB.ai_reply_drafts.insert_one({"message_id": str(m["_id"]), "thread_id": tid, "doctor_id": t["owner_id"], "studio_id": t.get("ai_clinic") or "", "category": "clinico",
                                   "urgent_hint": False, "created_at": now, "updated_at": now, "editor_id": None, "status": "in_attesa",
                                   **seal_fields({"text": "TEST_DRAFT Gentile signora, può proseguire con lavaggi nasali e idratazione; se compare febbre ci ricontatti."}, ("text",))})
DB.threads.update_one({"_id": t["_id"]}, {"$set": {"ai_pending": True}})
print("draft", r.inserted_id)
