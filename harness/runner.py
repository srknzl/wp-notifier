import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from . import vault


@dataclass
class TestResult:
    name: str
    category: str
    passed: bool
    message: str = ""
    seconds: float = 0.0


@dataclass
class RunResult:
    results: list[TestResult] = field(default_factory=list)
    frozen: bool = True
    timed_out: bool = False
    log: str = ""
    seconds: float = 0.0


def docker_available() -> bool:
    if not shutil.which("docker"):
        return False
    probe = subprocess.run(["docker", "info"], capture_output=True, text=True)
    return probe.returncode == 0


def _category(name: str, categories: list[str]) -> str:
    stem = name.split("[")[0]
    for cat in categories:
        if stem.startswith(f"test_{cat}_"):
            return cat
    return "other"


def parse_junit(xml_file: Path, categories: list[str]) -> list[TestResult]:
    if not xml_file.exists():
        return []
    root = ET.parse(xml_file).getroot()
    out = []
    for case in root.iter("testcase"):
        name = case.get("name", "?")
        bad = case.find("failure")
        if bad is None:
            bad = case.find("error")
        skipped = case.find("skipped") is not None
        msg = ""
        if bad is not None:
            msg = (bad.get("message") or bad.text or "").strip().splitlines()[0][:300] if (bad.get("message") or bad.text) else "failed"
        elif skipped:
            msg = "skipped"
        out.append(TestResult(name, _category(name, categories), bad is None and not skipped, msg,
                              float(case.get("time", 0) or 0)))
    return out


def _image_tag(cdir: Path, solution: Path) -> str:
    h = hashlib.sha256((cdir / "Dockerfile").read_bytes())
    req = solution / "requirements.txt"
    if req.exists():
        h.update(req.read_bytes())
    return f"sdc-{cdir.name}:{h.hexdigest()[:12]}"


def _build(cdir: Path, solution: Path, tag: str) -> None:
    have = subprocess.run(["docker", "image", "inspect", tag], capture_output=True)
    if have.returncode == 0:
        return
    with tempfile.TemporaryDirectory() as ctx:
        shutil.copy(cdir / "Dockerfile", Path(ctx) / "Dockerfile")
        req = solution / "requirements.txt"
        (Path(ctx) / "requirements.txt").write_bytes(req.read_bytes() if req.exists() else b"")
        print(f"  building {tag} (first run only)...", flush=True)
        subprocess.run(["docker", "build", "-q", "-t", tag, ctx], check=True)


def stage_tests(cdir: Path, dest: Path, hidden: bool) -> None:
    shutil.copytree(cdir / "tests", dest, dirs_exist_ok=True)
    if hidden:
        vault.extract(cdir.name, cdir / "vault.bin", dest / "hidden", prefix="hidden/")


IGNORE = shutil.ignore_patterns("target", "node_modules", ".revealed", "__pycache__", ".git", "build", "bin", "obj")


def _fmt(args: list[str], **kw) -> list[str]:
    return [a.format(**kw) for a in args]


def run_tests(cdir: Path, cfg: dict, solution: Path, hidden: bool, local: bool) -> RunResult:
    categories = list(cfg["weights"].keys())
    timeout = int(cfg.get("timeout_s", 300))
    started = time.time()
    with tempfile.TemporaryDirectory(prefix="sdc-") as tmp:
        base = Path(tmp).resolve()
        tests, out, sol = base / "tests", base / "out", base / "solution"
        out.mkdir()
        shutil.copytree(solution, sol, ignore=IGNORE)
        stage_tests(cdir, tests, hidden)
        if local:
            paths = dict(python=sys.executable, tests=str(tests), out=str(out), solution=str(sol))
        else:
            paths = dict(python="python3", tests="/work/tests", out="/work/out", solution="/work/solution")
        run_cmd = json.dumps(_fmt(cfg.get("run_cmd", []), **paths))
        build = _fmt(cfg.get("build_cmd", []), **paths)
        test = _fmt(cfg["test_cmd"], **paths)
        envs = {"PYTHONPATH": paths["solution"], "SDC_SOLUTION": paths["solution"], "SDC_RUN": run_cmd,
                "PYTHONDONTWRITEBYTECODE": "1"}
        if local:
            env = dict(os.environ, **envs)
            if build:
                b = subprocess.run(build, capture_output=True, text=True, cwd=sol, env=env,
                                   timeout=int(cfg.get("build_timeout_s", 600)), shell=sys.platform == "win32")
                if b.returncode != 0:
                    return RunResult([], frozen=False, log="BUILD FAILED\n" + b.stdout + b.stderr,
                                     seconds=time.time() - started)
            cmd, kill = test, None
        else:
            tag = _image_tag(cdir, solution)
            _build(cdir, solution, tag)
            limits = ["--cpus", str(cfg.get("cpus", "2")), "--memory", str(cfg.get("memory", "1g"))]
            envflags = [x for k, v in envs.items() for x in ("-e", f"{k}={v}")]
            if build:
                b = subprocess.run(["docker", "run", "--rm", *limits, *envflags, "-v", f"{sol}:/work/solution",
                                    "-w", "/work/solution", tag, *build], capture_output=True, text=True,
                                   timeout=int(cfg.get("build_timeout_s", 600)))
                if b.returncode != 0:
                    return RunResult([], log="BUILD FAILED\n" + b.stdout + b.stderr, seconds=time.time() - started)
            name = f"sdc-run-{uuid.uuid4().hex[:8]}"
            cmd = ["docker", "run", "--rm", "--name", name, "--network", "none", *limits, *envflags,
                   "-v", f"{sol}:/work/solution:ro", "-v", f"{tests}:/work/tests:ro", "-v", f"{out}:/work/out",
                   "-w", "/work/solution", tag, *test]
            env = None
            kill = ["docker", "kill", name]
        timed_out = False
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env, cwd=sol)
            log = proc.stdout + proc.stderr
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            log = exc.stdout if isinstance(exc.stdout, str) else ""
            if kill:
                subprocess.run(kill, capture_output=True)
        results = parse_junit(out / "results.xml", categories)
    return RunResult(results, frozen=not local, timed_out=timed_out, log=log, seconds=time.time() - started)


def category_scores(results: list[TestResult], weights: dict) -> tuple[dict, float]:
    per = {}
    total = 0.0
    wsum = sum(weights.values())
    for cat, w in weights.items():
        cases = [r for r in results if r.category == cat]
        frac = (sum(r.passed for r in cases) / len(cases)) if cases else 0.0
        per[cat] = {"passed": sum(r.passed for r in cases), "total": len(cases), "fraction": frac, "weight": w}
        total += frac * w
    return per, (100.0 * total / wsum) if wsum else 0.0
