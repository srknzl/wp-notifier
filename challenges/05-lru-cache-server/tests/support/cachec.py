"""Harness helpers for 05: start the cache on a free port and talk its line protocol."""
import random
import re
import socket
import subprocess
import threading
import time
from pathlib import Path

from proc import run_cmd

RUNNING = []


def kill_all():
    while RUNNING:
        RUNNING.pop().kill()


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


class Server:
    def __init__(self, log_dir, max_bytes=16 << 20, ready_timeout=30.0):
        self.port = free_port()
        self.max_bytes = max_bytes
        self.log = Path(log_dir) / f"server-{self.port}.log"
        with open(self.log, "ab") as err:
            self.p = subprocess.Popen(run_cmd("--port", self.port, "--max-bytes", max_bytes),
                                      stdin=subprocess.DEVNULL, stdout=err, stderr=err)
        RUNNING.append(self)
        deadline = time.time() + ready_timeout
        while True:
            try:
                c = self.client(timeout=2)
                if c.call("STATS").startswith("STATS "):
                    c.close()
                    break
                c.close()
            except (OSError, EOFError):
                pass
            if self.p.poll() is not None:
                raise RuntimeError(f"server exited with code {self.p.returncode}:\n{self.tail()}")
            if time.time() > deadline:
                raise RuntimeError("server did not accept connections")
            time.sleep(0.1)

    def tail(self):
        return self.log.read_text(errors="replace")[-800:]

    def client(self, timeout=30):
        return Client(self.port, timeout)

    def alive(self):
        return self.p.poll() is None

    def stats(self):
        c = self.client()
        try:
            return parse_stats(c.call("STATS"))
        finally:
            c.close()

    def kill(self):
        if self.p.poll() is None:
            self.p.kill()
        self.p.wait(10)


def parse_stats(line):
    assert line.startswith("STATS "), line
    return {k: int(v) for k, v in re.findall(r"(\w+)=(\d+)", line)}


class Client:
    def __init__(self, port, timeout=30):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.r = self.sock.makefile("rb")

    def send(self, lines):
        self.sock.sendall("".join(l + "\n" for l in lines).encode("latin-1"))

    def recv(self):
        line = self.r.readline()
        if not line:
            raise EOFError("server closed the connection")
        return line.decode("latin-1").rstrip("\n").rstrip("\r")

    def call(self, line):
        self.send([line])
        return self.recv()

    def batch(self, lines):
        err = []

        def pump():
            try:
                for i in range(0, len(lines), 1000):
                    self.send(lines[i:i + 1000])
            except OSError as e:
                err.append(e)

        t = threading.Thread(target=pump, daemon=True)
        t.start()
        out = [self.recv() for _ in lines]
        t.join()
        if err:
            raise err[0]
        return out

    def close(self):
        try:
            self.r.close()
            self.sock.close()
        except OSError:
            pass


def cost(key, value):
    return len(key) + len(value) + 64


class LruModel:
    def __init__(self, max_bytes):
        from collections import OrderedDict
        self.max = max_bytes
        self.items = OrderedDict()
        self.bytes = 0
        self.hits = 0

    def get(self, key):
        if key in self.items:
            self.items.move_to_end(key)
            self.hits += 1
            return True
        return False

    def set(self, key, value):
        if key in self.items:
            self.bytes -= cost(key, self.items.pop(key))
        self.items[key] = value
        self.bytes += cost(key, value)
        while self.bytes > self.max:
            k, v = self.items.popitem(last=False)
            self.bytes -= cost(k, v)
