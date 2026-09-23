#!/usr/bin/env python3
"""Dump herdr-side structure for every agent-canvas workspace:
workspace -> tabs (labels) -> panes (agent/status)."""
import json, socket, sys

SOCK = "/root/.config/herdr/herdr.sock"

def call(method, params=None):
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(8)
    s.connect(SOCK)
    s.sendall(json.dumps({"id": "x", "method": method, "params": params or {}}).encode() + b"\n")
    buf = b""
    while b"\n" not in buf:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
    s.close()
    return json.loads(buf.split(b"\n")[0])

r = call("workspace.list")
wss = r["result"]["workspaces"]
if not wss:
    print("(no herdr workspaces)")
for w in wss:
    print(f"WS {w['workspace_id']} label={w['label']!r} tabs={w['tab_count']} panes={w['pane_count']}")
    t = call("tab.list", {"workspace_id": w["workspace_id"]})
    for tab in t["result"]["tabs"]:
        print(f"  TAB {tab['tab_id']} label={tab['label']!r} panes={tab['pane_count']} agent_status={tab['agent_status']}")
    p = call("pane.list", {"workspace_id": w["workspace_id"]})
    for pn in p["result"]["panes"]:
        print(f"    PANE {pn['pane_id']} tab={pn['tab_id']} agent={pn.get('agent')} status={pn.get('agent_status')}")
