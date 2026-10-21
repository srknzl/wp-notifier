"""Harness helper: start the candidate's program (SDC_RUN) and talk to it line by line."""
import json
import os
import queue
import subprocess
import threading


def run_cmd(*extra):
    return json.loads(os.environ["SDC_RUN"]) + [str(e) for e in extra]


class LineProc:
    def __init__(self, *extra, stderr_file=None, env=None):
        self.p = subprocess.Popen(run_cmd(*extra), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=stderr_file or subprocess.DEVNULL, bufsize=0, env=env)
        self.lines = queue.Queue()
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._reader.start()

    def _read(self):
        buf = b""
        while True:
            try:
                chunk = os.read(self.p.stdout.fileno(), 65536)
            except OSError:
                chunk = b""
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                self.lines.put(line.decode().rstrip("\r"))
        self.lines.put(None)

    def send(self, *lines):
        self.p.stdin.write("".join(l + "\n" for l in lines).encode())
        self.p.stdin.flush()

    def recv(self, timeout=10.0):
        line = self.lines.get(timeout=timeout)
        if line is None:
            raise EOFError("process closed stdout")
        return line

    def call(self, line, timeout=10.0):
        self.send(line)
        return self.recv(timeout)

    def kill(self):
        if self.p.poll() is None:
            self.p.kill()
        self.p.wait(10)
        for s in (self.p.stdin, self.p.stdout):
            try:
                s.close()
            except OSError:
                pass

    def close(self):
        try:
            self.p.stdin.close()
            self.p.wait(10)
        except Exception:
            self.kill()
