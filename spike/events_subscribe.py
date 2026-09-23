#!/usr/bin/env python3
"""Subscribe to herdr events and log raw NDJSON to events-sample.jsonl."""
import json, socket, sys, time

SOCK = "/home/kimi/.config/herdr/herdr.sock"
OUT = "/mnt/agents/output/spike/events-sample.jsonl"
DURATION = int(sys.argv[1]) if len(sys.argv) > 1 else 45

subs = [
    {"type": "workspace.created"}, {"type": "workspace.updated"}, {"type": "workspace.renamed"},
    {"type": "workspace.closed"}, {"type": "workspace.focused"},
    {"type": "tab.created"}, {"type": "tab.closed"}, {"type": "tab.focused"}, {"type": "tab.renamed"},
    {"type": "pane.created"}, {"type": "pane.closed"}, {"type": "pane.updated"},
    {"type": "pane.focused"}, {"type": "pane.exited"}, {"type": "pane.agent_detected"},
    {"type": "pane.agent_status_changed", "pane_id": "w1:p2"},
    {"type": "pane.scroll_changed", "pane_id": "w1:p1"},
    {"type": "pane.output_matched", "pane_id": "w1:p1", "source": "recent",
     "match": {"type": "substring", "value": "MATCHME"}, "lines": 3},
    {"type": "layout.updated"},
]

s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(SOCK)
req = {"id": "sub:1", "method": "events.subscribe", "params": {"subscriptions": subs}}
s.sendall((json.dumps(req) + "\n").encode())

buf = b""
t0 = time.time()
n = 0
with open(OUT, "a") as f:
    f.write(json.dumps({"_meta": "subscribe_request", "request": req, "ts": t0}) + "\n")
    s.settimeout(DURATION)
    try:
        while time.time() - t0 < DURATION:
            chunk = s.recv(65536)
            if not chunk:
                print("SERVER CLOSED CONNECTION", flush=True)
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if not line.strip():
                    continue
                n += 1
                elapsed = round(time.time() - t0, 3)
                rec = json.dumps({"_t": elapsed, "raw": json.loads(line)})
                f.write(rec + "\n")
                f.flush()
                print(f"[{elapsed:7.3f}s]", line.decode()[:300], flush=True)
    except socket.timeout:
        pass
print(f"total messages: {n}")
