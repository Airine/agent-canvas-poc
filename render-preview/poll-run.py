#!/usr/bin/env python3
"""Poll ws-demo graph until done; auto-approve n-data when it blocks."""
import json, time, urllib.request

BASE = "http://localhost:3000"

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=8) as r:
        return json.load(r)

def post(path, body=None):
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)

approved = False
for i in range(40):
    g = get("/api/workspaces/ws-demo")["graph"]
    line = " ".join(f"{n['id']}:{n['status']}" for n in g["nodes"])
    print(f"[{i}] runState={g['runState']} | {line}", flush=True)
    ndata = next(n for n in g["nodes"] if n["id"] == "n-data")
    if ndata["status"] == "waiting" and not approved:
        print("    -> approving n-data:", ndata.get("statusReason"), flush=True)
        print("    ->", post("/api/nodes/n-data/approval", {"decision": "approve"}), flush=True)
        approved = True
    if g["runState"] == "done":
        break
    time.sleep(4)
