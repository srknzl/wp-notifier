"""Harness helpers for 02: start the store, pipeline commands, crash it, tear its newest file."""
import hashlib
import os
import threading
import time
from pathlib import Path

from proc import LineProc

SHIM = "/opt/sdc/slowsync.so"


def has_shim():
    return os.path.exists(SHIM)


def value(key, ver, size=None):
    seed = hashlib.sha256(f"{key}:{ver}".encode()).hexdigest()
    n = size if size is not None else 16 + int(seed[:4], 16) % 200
    return f"{key}.{ver}." + (seed * (n // 64 + 1))[:n]


class Kv(LineProc):
    def __init__(self, data_dir, fsync_log=None):
        env = dict(os.environ)
        if has_shim():
            env["LD_PRELOAD"] = SHIM
        if fsync_log:
            env["SDC_FSYNC_LOG"] = str(fsync_log)
        super().__init__(str(data_dir), env=env)

    def put(self, k, v):
        r = self.call(f"PUT {k} {v}")
        assert r == "OK", f"PUT {k}: {r!r}"

    def get(self, k):
        r = self.call(f"GET {k}")
        if r == "NONE":
            return None
        assert r.startswith("VALUE "), f"GET {k}: {r[:80]!r}"
        return r[6:]

    def delete(self, k):
        r = self.call(f"DEL {k}")
        assert r == "OK", f"DEL {k}: {r!r}"

    def batch(self, cmds, timeout=60.0):
        out = []
        t = threading.Thread(target=self._send_all, args=(cmds,), daemon=True)
        t.start()
        deadline = time.time() + timeout
        for _ in cmds:
            out.append(self.recv(max(0.1, deadline - time.time())))
        t.join(5)
        return out

    def get_many(self, keys, timeout=60.0):
        res = self.batch([f"GET {k}" for k in keys], timeout)
        vals = {}
        for k, r in zip(keys, res):
            if r == "NONE":
                vals[k] = None
            else:
                assert r.startswith("VALUE "), f"GET {k}: {r[:80]!r}"
                vals[k] = r[6:]
        return vals

    def _send_all(self, cmds, chunk=500):
        try:
            for i in range(0, len(cmds), chunk):
                self.send(*cmds[i:i + chunk])
        except (OSError, ValueError):
            pass

    def crash_after(self, cmds, acks, timeout=60.0):
        t = threading.Thread(target=self._send_all, args=(cmds,), daemon=True)
        t.start()
        got = []
        deadline = time.time() + timeout
        while len(got) < acks:
            got.append(self.recv(max(0.1, deadline - time.time())))
        self.kill()
        t.join(5)
        return got


def disk_usage(data_dir):
    return sum(p.stat().st_size for p in Path(data_dir).rglob("*") if p.is_file())


def tear(data_dir, junk):
    files = [p for p in Path(data_dir).rglob("*") if p.is_file()]
    if not files:
        return None
    newest = max(files, key=lambda p: (p.stat().st_mtime_ns, p.name))
    with open(newest, "ab") as f:
        f.write(junk)
    return newest


class Model:
    """Allowed values per key after a crash: last acked state, or any later in-flight state."""

    def __init__(self, state=None):
        self.state = dict(state or {})
        self.ops = []

    def put(self, k, v):
        self.ops.append((k, v))
        return f"PUT {k} {v}"

    def delete(self, k):
        self.ops.append((k, None))
        return f"DEL {k}"

    def allowed(self, acked):
        per = {}
        for i, (k, v) in enumerate(self.ops):
            per.setdefault(k, []).append((i, v))
        out = {}
        for k, seq in per.items():
            cur = self.state.get(k)
            opts = set()
            for i, v in seq:
                if i < acked:
                    cur = v
                else:
                    opts.add(v)
            opts.add(cur)
            out[k] = opts
        return out

    def check(self, observed, acked):
        allowed = self.allowed(acked)
        for k in set(self.state) | set(allowed):
            ok = allowed.get(k, {self.state.get(k)})
            got = observed.get(k)
            assert got in ok, (f"key {k}: got {str(got)[:60]!r}, allowed {[str(x)[:40] for x in ok][:4]} "
                               f"(acked {acked} of {len(self.ops)} ops)")
