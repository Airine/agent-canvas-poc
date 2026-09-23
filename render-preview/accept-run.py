#!/usr/bin/env python3
"""Acceptance driver: run a workspace, auto-approve gates via SCOPED endpoint
(new 'approved' vocabulary), print every state transition, exit on done."""
import json, sys, time, urllib.request

BASE = "http://localhost:3000"
WS = sys.argv[1]

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=8) as r:
        return json.load(r)

def post(path, body=None):
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)

print("run:", post(f"/api/workspaces/{WS}/run"), flush=True)
prev = {}
approved = set()
final = None
for i in range(60):
    g = get(f"/api/workspaces/{WS}/graph")
    for n in g["nodes"]:
        key = (n["status"], n.get("statusReason"), n.get("progress"))
        if prev.get(n["id"]) != key:
            extra = []
            if n.get("statusReason"): extra.append(f"reason={n['statusReason']!r}")
            if n.get("progress") not in (None,): extra.append(f"progress={n['progress']}")
            if n.get("paneId"): extra.append(f"pane={n['paneId']}")
            print(f"[{i:02}] {n['id']}: {n['status']} {' '.join(extra)}", flush=True)
            prev[n["id"]] = key
        if n["status"] == "waiting" and n["id"] not in approved:
            prompt = (n.get("approval") or {}).get("prompt", "")
            r = post(f"/api/workspaces/{WS}/nodes/{n['id']}/approval", {"decision": "approved"})
            print(f"    >> APPROVED {n['id']} (prompt={prompt!r}) -> {r}", flush=True)
            approved.add(n["id"])
    if g["runState"] == "done":
        final = g
        break
    time.sleep(2)

if not final:
    print("TIMEOUT waiting for done", flush=True)
    sys.exit(1)
print(f"== runState=done after ~{i*2}s ==", flush=True)
for n in final["nodes"]:
    print(f"   FINAL {n['id']}: {n['status']} ({n.get('statusReason') or ''})", flush=True)
for e in final["edges"]:
    if e["kind"] in ("weak", "error"):
        print(f"   EDGE {e['id']} [{e['kind']}]: label={e.get('label')!r}", flush=True)
