# Helper for iteration 78 checks: login + list/inspect TEST_ data via public API
import os, sys, json, requests
BASE = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/') + '/api'
CREDS = {"medico": ("medico@mantmed.it", "Auscula-Studio-2026"), "admin": ("mantmedicine@gmail.com", "MM-3EjwJpn5w64aCu2ZkOLA"),
         "oculista": ("oculista.demo@example.com", "Oculista-Demo-2026"), "gyn": ("ginecologo.demo@example.com", "Gineco-Demo-2026"),
         "genitore": ("genitore.demo@example.com", "Portale-Demo-2026"), "cardio": ("cardiologo.demo@example.com", "Cardio-Demo-2026")}


def sess(who):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": CREDS[who][0], "password": CREDS[who][1]})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "patients":
        s = sess(sys.argv[2])
        for p in s.get(f"{BASE}/patients").json():
            if p["name"].startswith(sys.argv[3] if len(sys.argv) > 3 else "TEST_"):
                print(p.get("id") or p.get("_id"), p["name"], p.get("birth_date"))
    elif cmd == "get":
        s = sess(sys.argv[2]); r = s.get(f"{BASE}{sys.argv[3]}"); print(r.status_code, r.text[:3000])
    elif cmd == "post":
        s = sess(sys.argv[2]); r = s.post(f"{BASE}{sys.argv[3]}", json=json.loads(sys.argv[4])); print(r.status_code, r.text[:2000])
    elif cmd == "delete":
        s = sess(sys.argv[2]); r = s.delete(f"{BASE}{sys.argv[3]}"); print(r.status_code, r.text[:500])
