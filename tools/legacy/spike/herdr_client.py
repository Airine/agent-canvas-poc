#!/usr/bin/env python3
"""Minimal NDJSON client for herdr socket API."""
import json, socket, threading, time, sys

SOCK = "/home/kimi/.config/herdr/herdr.sock"

class Herdr:
    def __init__(self, sock=SOCK):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(sock)
        self.buf = b""
        self._id = 0
        self.lock = threading.Lock()

    def _next_id(self):
        with self.lock:
            self._id += 1
            return f"py:{self._id}"

    def send(self, method, params=None):
        rid = self._next_id()
        msg = json.dumps({"id": rid, "method": method, "params": params or {}}) + "\n"
        self.sock.sendall(msg.encode())
        return rid

    def readline(self, timeout=None):
        """Read one NDJSON line. Returns parsed dict or None on timeout."""
        self.sock.settimeout(timeout)
        try:
            while b"\n" not in self.buf:
                chunk = self.sock.recv(65536)
                if not chunk:
                    raise ConnectionError("socket closed")
                self.buf += chunk
        except socket.timeout:
            return None
        finally:
            self.sock.settimeout(None)
        line, self.buf = self.buf.split(b"\n", 1)
        return json.loads(line) if line.strip() else None

    def call(self, method, params=None, timeout=10):
        rid = self.send(method, params)
        t0 = time.time()
        while time.time() - t0 < timeout:
            m = self.readline(timeout=max(0.1, timeout - (time.time() - t0)))
            if m is None:
                break
            if m.get("id") == rid:
                return m
        return None
