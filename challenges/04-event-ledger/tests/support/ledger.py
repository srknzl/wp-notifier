"""Harness helpers for 04: start the service on a free port, talk JSON over HTTP, crash it."""
import http.client
import json
import random
import socket
import subprocess
import threading
import time
from pathlib import Path

from proc import run_cmd


def free_port():
    rnd = random.Random()
    while True:
        port = rnd.randint(20000, 32000)
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port


RUNNING = []


def kill_all():
    while RUNNING:
        RUNNING.pop().kill()


class Ledger:
    def __init__(self, data_dir, ready_timeout=20.0):
        self.port = free_port()
        self._local = threading.local()
        self.log = Path(data_dir).parent / "server.log"
        with open(self.log, "ab") as err:
            self.p = subprocess.Popen(run_cmd("--port", self.port, "--data", data_dir),
                                      stdin=subprocess.DEVNULL, stdout=err, stderr=err)
        RUNNING.append(self)
        deadline = time.time() + ready_timeout
        while True:
            try:
                if self.req("GET", "/health", timeout=1)[0] == 200:
                    break
            except (OSError, http.client.HTTPException):
                pass
            if self.p.poll() is not None:
                tail = self.log.read_text(errors="replace")[-600:]
                raise RuntimeError(f"service exited with code {self.p.returncode} during startup:\n{tail}")
            if time.time() > deadline:
                self.kill()
                raise RuntimeError("service did not become healthy")
            time.sleep(0.05)

    def _conn(self, timeout):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
            self._local.conn = conn
            self._local.used = False
        conn.timeout = timeout
        if conn.sock is not None:
            conn.sock.settimeout(timeout)
        return conn

    def _drop(self):
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            conn.close()
        self._local.conn = None

    def req(self, method, path, body=None, timeout=30):
        data = None if body is None else json.dumps(body)
        headers = {"Content-Type": "application/json"} if data is not None else {}
        for attempt in (0, 1):
            conn = self._conn(timeout)
            reused = self._local.used
            try:
                conn.request(method, path, body=data, headers=headers)
                resp = conn.getresponse()
                raw = resp.read()
            except (ConnectionError, http.client.RemoteDisconnected, http.client.BadStatusLine):
                self._drop()
                if reused and attempt == 0:
                    continue
                raise
            except Exception:
                self._drop()
                raise
            self._local.used = True
            if resp.will_close:
                self._drop()
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = raw.decode(errors="replace")
            return resp.status, payload

    def create(self, account):
        return self.req("POST", "/accounts", {"account": account})

    def deposit(self, account, amount, key):
        return self.req("POST", "/deposits", {"account": account, "amount": amount, "key": key})

    def transfer(self, src, dst, amount, key):
        return self.req("POST", "/transfers", {"from": src, "to": dst, "amount": amount, "key": key})

    def balance(self, account):
        status, body = self.req("GET", f"/accounts/{account}")
        assert status == 200, (status, body)
        return body["balance"]

    def events(self):
        out, after = [], 0
        while True:
            status, body = self.req("GET", f"/events?after={after}&limit=1000")
            assert status == 200, (status, body)
            if not body["events"]:
                return out
            out += body["events"]
            after = body["events"][-1]["seq"]

    def kill(self):
        if self.p.poll() is None:
            self.p.kill()
        self.p.wait(10)

    def close(self):
        self.kill()


def replay(events):
    bal = {}
    for i, e in enumerate(events, 1):
        assert e["seq"] == i, f"event {i} has seq {e['seq']}"
        if e["type"] == "account_created":
            assert e["account"] not in bal
            bal[e["account"]] = 0
        elif e["type"] == "deposit":
            bal[e["account"]] += e["amount"]
        elif e["type"] == "transfer":
            bal[e["from"]] -= e["amount"]
            bal[e["to"]] += e["amount"]
            assert bal[e["from"]] >= 0, f"event {i} overdraws {e['from']}"
        else:
            raise AssertionError(f"unknown event type {e['type']}")
    return bal


def tear(data_dir, junk):
    files = [p for p in Path(data_dir).rglob("*") if p.is_file()]
    if not files:
        return None
    newest = max(files, key=lambda p: (p.stat().st_mtime_ns, p.name))
    with open(newest, "ab") as f:
        f.write(junk)
    return newest
