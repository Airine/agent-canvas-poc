#!/usr/bin/env python3
"""Parity test B: interactive-shell fallback node.
create ws -> run -> wait running -> scoped input 'echo PARITY_$((40+2))'
-> pane.read shows PARITY_42 -> input 'exit' -> node completed (exit 0)."""
import json, socket, time, urllib.request

BASE = "http://localhost:3000"
SOCK = "/root/.config/herdr/herdr.sock"

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=8) as r:
        return json.load(r)

def post(path, body=None):
    data = json.dumps(body).encode() if body is not None else b""
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r), r.status

def herdr(method, params=None):
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(8)
    s.connect(SOCK)
    s.sendall(json.dumps({"id": "x", "method": method, "params": params or {}}).encode() + b"\n")
    buf = b""
    while b"\n" not in buf:
        c = s.recv(65536)
        if not c:
            break
        buf += c
    s.close()
    return json.loads(buf.split(b"\n")[0])

GRAPH = {
    "zones": [{"id": "z1", "title": "交互"}],
    "nodes": [{
        "id": "n-parity", "type": "operation", "title": "交互 Shell", "status": "queued",
        "harness": "shell-agent", "env": "herdr-local", "agentId": "ag-parity-01",
        "x": 80, "y": 80, "zoneId": "z1",
        # no command on purpose -> interactive `bash --norc -i` fallback
    }],
    "edges": [],
    "runState": "idle",
}

summary, status = post("/api/workspaces", {
    "title": "Parity Test (temp)", "path": "/tmp", "description": "交互 shell parity 验收，测完即删",
    "graph": GRAPH,
})
WID = summary["id"]
print(f"created {WID} (http {status})", flush=True)

print("run:", post(f"/api/workspaces/{WID}/run")[0], flush=True)

pane_id = None
for _ in range(15):
    g = get(f"/api/workspaces/{WID}/graph")
    n = g["nodes"][0]
    if n["status"] == "running" and n.get("paneId"):
        pane_id = n["paneId"]
        break
    time.sleep(1)
assert pane_id, "node never went running with a pane"
print(f"node running, pane={pane_id}", flush=True)

r = post(f"/api/workspaces/{WID}/nodes/n-parity/input", {"text": "echo PARITY_$((40+2))\r"})
print("input echo ->", r[0], flush=True)

found = False
for _ in range(10):
    time.sleep(1)
    rd = herdr("pane.read", {"pane_id": pane_id, "source": "visible", "format": "ansi",
                             "lines": 50, "strip_ansi": True})
    text = rd["result"]["read"]["text"]
    if "PARITY_42" in text:
        found = True
        break
print("pane.read contains PARITY_42:", found, flush=True)
assert found, "echo output not visible in PTY snapshot"
print("--- snapshot tail ---", flush=True)
print(text[-260:], flush=True)

r = post(f"/api/workspaces/{WID}/nodes/n-parity/input", {"text": "exit\r"})
print("input exit ->", r[0], flush=True)
final = None
for _ in range(15):
    time.sleep(1)
    g = get(f"/api/workspaces/{WID}/graph")
    n = g["nodes"][0]
    if n["status"] in ("completed", "failed"):
        final = n
        break
print("final node status:", final["status"], "reason:", final.get("statusReason"),
      "| runState:", g["runState"], flush=True)
assert final["status"] == "completed", "interactive shell did not complete with exit 0"

ev = get(f"/api/workspaces/{WID}/nodes/n-parity/events")
print("--- events ---", flush=True)
for e in ev[-6:]:
    print(f"  {e['kind']} | {e['text'][:70]}", flush=True)
print("PARITY_WS_ID=" + WID, flush=True)
