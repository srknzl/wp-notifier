"""Harness helpers for 06: a programmable backend that counts calls, and a client for the proxy."""
import http.client
import random
import socket
import subprocess
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from proc import run_cmd

RUNNING = []


def kill_all():
    while RUNNING:
        RUNNING.pop().stop()


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


class Backend:
    """Answers GET with `<target> #<n>` unless a rule for the path says otherwise."""

    def __init__(self):
        self.rules = {}
        self.calls = Counter()
        self.lock = threading.Lock()
        self.active = 0
        self.max_active = 0
        self.socks = set()
        backend = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self):
                backend._serve(self)

            def log_message(self, *a):
                pass

        class Server(ThreadingHTTPServer):
            daemon_threads = True
            request_queue_size = 1024

            def handle_error(self, request, client_address):
                pass

            def process_request(self, request, client_address):
                with backend.lock:
                    backend.socks.add(request)
                super().process_request(request, client_address)

            def shutdown_request(self, request):
                with backend.lock:
                    backend.socks.discard(request)
                super().shutdown_request(request)

        self.port = free_port()
        self.url = f"http://127.0.0.1:{self.port}"
        self.httpd = Server(("127.0.0.1", self.port), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        self.thread.start()
        RUNNING.append(self)

    def rule(self, path, status=200, delay=0.0, body=None, ctype="text/plain"):
        self.rules[path] = {"status": status, "delay": delay, "body": body, "ctype": ctype}

    def count(self, target=None):
        with self.lock:
            return sum(self.calls.values()) if target is None else self.calls[target]

    def reset(self):
        with self.lock:
            self.calls.clear()
            self.max_active = self.active

    def _serve(self, h):
        target = h.path
        path = target.split("?", 1)[0]
        with self.lock:
            self.calls[target] += 1
            n = self.calls[target]
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            r = self.rules.get(path, {})
            if r.get("delay"):
                time.sleep(r["delay"])
            body = r.get("body")
            if callable(body):
                body = body(n)
            if body is None:
                body = f"{target} #{n}"
            if isinstance(body, str):
                body = body.encode()
            h.send_response(r.get("status", 200))
            h.send_header("Content-Type", r.get("ctype", "text/plain"))
            h.send_header("Content-Length", str(len(body)))
            h.end_headers()
            h.wfile.write(body)
        finally:
            with self.lock:
                self.active -= 1

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        with self.lock:
            socks = list(self.socks)
        for s in socks:
            try:
                s.shutdown(socket.SHUT_RDWR)
                s.close()
            except OSError:
                pass


class Resp:
    def __init__(self, status, body, headers, elapsed):
        self.status = status
        self.body = body
        self.headers = headers
        self.elapsed = elapsed

    @property
    def text(self):
        return self.body.decode("latin-1")

    @property
    def cache(self):
        return self.headers.get("x-cache", "")


class Proxy:
    def __init__(self, log_dir, backend, ttl_ms=1000, stale_ms=1000, timeout_ms=1000, max_inflight=64,
                 failure_threshold=5, cooldown_ms=1000, ready_timeout=60.0):
        self.port = free_port()
        self.log = Path(log_dir) / f"proxy-{self.port}.log"
        self.local = threading.local()
        args = ["--port", self.port, "--backend", backend.url, "--ttl-ms", ttl_ms, "--stale-ms", stale_ms,
                "--timeout-ms", timeout_ms, "--max-inflight", max_inflight,
                "--failure-threshold", failure_threshold, "--cooldown-ms", cooldown_ms]
        with open(self.log, "ab") as err:
            self.p = subprocess.Popen(run_cmd(*args), stdin=subprocess.DEVNULL, stdout=err, stderr=err)
        RUNNING.append(self)
        deadline = time.time() + ready_timeout
        while True:
            try:
                if self.get("/__health", timeout=2).status == 200:
                    break
            except OSError:
                self._drop()
            if self.p.poll() is not None:
                raise RuntimeError(f"proxy exited with code {self.p.returncode}:\n{self.tail()}")
            if time.time() > deadline:
                raise RuntimeError("proxy did not answer /__health")
            time.sleep(0.1)

    def tail(self):
        return self.log.read_text(errors="replace")[-800:]

    def _conn(self, timeout):
        c = getattr(self.local, "c", None)
        if c is None:
            c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
            self.local.c = c
        c.timeout = timeout
        if c.sock is not None:
            c.sock.settimeout(timeout)
        return c

    def _drop(self):
        c = getattr(self.local, "c", None)
        if c is not None:
            c.close()
        self.local.c = None

    def get(self, target, timeout=10.0, method="GET"):
        for attempt in range(2):
            c = self._conn(timeout)
            reused = c.sock is not None
            t0 = time.time()
            try:
                c.request(method, target)
                r = c.getresponse()
                body = r.read()
                headers = {k.lower(): v for k, v in r.getheaders()}
                if r.getheader("connection", "").lower() == "close":
                    self._drop()
                return Resp(r.status, body, headers, time.time() - t0)
            except (ConnectionError, http.client.RemoteDisconnected, http.client.BadStatusLine):
                self._drop()
                if not reused or attempt:
                    raise
            except OSError:
                self._drop()
                raise

    def fresh_get(self, target, timeout=10.0):
        """One request on its own connection."""
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        t0 = time.time()
        try:
            c.request("GET", target)
            r = c.getresponse()
            body = r.read()
            return Resp(r.status, body, {k.lower(): v for k, v in r.getheaders()}, time.time() - t0)
        finally:
            c.close()

    def alive(self):
        return self.p.poll() is None

    def stop(self):
        if self.p.poll() is None:
            self.p.kill()
        self.p.wait(10)


def parallel(n, fn, workers=None):
    from concurrent.futures import ThreadPoolExecutor
    barrier = threading.Barrier(n)

    def run(i):
        barrier.wait(10)
        return fn(i)

    with ThreadPoolExecutor(workers or n) as ex:
        return list(ex.map(run, range(n)))
