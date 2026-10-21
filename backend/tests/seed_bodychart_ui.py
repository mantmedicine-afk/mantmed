"""Seed 2 TEST_ consultations (copies of an Aurora visit) for bodychart UI testing; `python seed_bodychart_ui.py clean` removes them."""
import sys
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

e = dotenv_values("/app/backend/.env")
db = MongoClient(e["MONGO_URL"])[e["DB_NAME"]]
if len(sys.argv) > 1 and sys.argv[1] == "clean":
    ids = [str(c["_id"]) for c in db.consultations.find({"patient_name": {"$regex": "^TEST_"}})]
    db.bodycharts.delete_many({"consultation_id": {"$in": ids}})
    db.files.delete_many({"consultation_id": {"$in": ids}})
    print(db.consultations.delete_many({"_id": {"$in": [ObjectId(i) for i in ids]}}).deleted_count)
    sys.exit()
src = db.consultations.find_one({"_id": ObjectId("6ad8841f1f70d7452350667b")})
out = []
for name, date in (("TEST_Aurora Ricci old", "2026-09-01T10:00:00+00:00"), ("TEST_Aurora Ricci new", "2026-10-21T18:00:00+00:00")):
    d = {k: v for k, v in src.items() if k != "_id"}
    d.update(patient_name=name, created_at=date, portal_published=False, report_sent_at=None)
    out.append(str(db.consultations.insert_one(d).inserted_id))
print(" ".join(out))
