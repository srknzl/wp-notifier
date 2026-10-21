#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import shutil
import sys
import tomllib
from pathlib import Path

from harness import judge, runner, vault

ROOT = Path(__file__).resolve().parent
CHALLENGES = ROOT / "challenges"
WORKSPACE = ROOT / "workspace"
PROGRESS = ROOT / ".progress"
VAULT_SRC = ROOT / ".vault-src"


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def all_challenges() -> list[Path]:
    return sorted(p for p in CHALLENGES.iterdir() if (p / "challenge.toml").exists())


def find(ref: str) -> Path:
    hits = [p for p in all_challenges() if p.name == ref or p.name.startswith(f"{ref}-") or p.name.split("-", 1)[0] == ref.zfill(2)]
    if len(hits) != 1:
        die(f"unknown challenge '{ref}'. Run: python ch.py list")
    return hits[0]


def load_cfg(cdir: Path) -> dict:
    return tomllib.loads((cdir / "challenge.toml").read_text(encoding="utf-8"))


def history(cid: str) -> list:
    f = PROGRESS / f"{cid}.json"
    return json.loads(f.read_text()) if f.exists() else []


def cmd_list(_):
    print(f"{'ID':<24} {'LANG':<11} {'LEVEL':<8} {'BEST':>5}  TITLE")
    for cdir in all_challenges():
        cfg = load_cfg(cdir)
        best = max((a["final"] for a in history(cdir.name)), default=None)
        print(f"{cdir.name:<24} {cfg['language']:<11} {cfg['difficulty']:<8} "
              f"{'-' if best is None else f'{best:.0f}':>5}  {cfg['title']}")


def cmd_start(a):
    cdir = find(a.challenge)
    dest = WORKSPACE / cdir.name
    if dest.exists() and not a.reset:
        die(f"{dest} already exists (use --reset to overwrite)")
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(cdir / "starter", dest)
    print(f"Workspace ready: {dest}\nSpec: {cdir / 'README.md'}\n"
          f"Public tests: python ch.py test {cdir.name}\nFull scoring: python ch.py score {cdir.name}")


def _solution(cdir: Path, a) -> Path:
    sol = Path(a.solution) if a.solution else WORKSPACE / cdir.name
    if not sol.exists():
        die(f"no solution at {sol}. Run: python ch.py start {cdir.name}")
    return sol


def _mode(a) -> bool:
    if a.local:
        return True
    if not runner.docker_available():
        die("Docker is not available. Install/start Docker, or pass --local (unfrozen, not comparable).")
    return False


def _print_results(run, per, tests_score):
    for r in run.results:
        mark = "PASS" if r.passed else "FAIL"
        line = f"  [{mark}] {r.category:<12} {r.name}"
        if not r.passed and r.message:
            line += f"\n           -> {r.message}"
        print(line)
    print()
    for cat, s in per.items():
        print(f"  {cat:<12} {s['passed']:>3}/{s['total']:<3} x weight {s['weight']}")
    print(f"  tests score: {tests_score:.1f}/100" + ("" if run.frozen else "  (LOCAL, unfrozen)"))
    if run.timed_out:
        print("  WARNING: test run hit the time limit; unfinished tests count as failed")
    if not run.results:
        print("  No test results were produced. Runner log tail:\n" + run.log[-3000:])


def cmd_test(a):
    cdir = find(a.challenge)
    cfg = load_cfg(cdir)
    local = _mode(a)
    run = runner.run_tests(cdir, cfg, _solution(cdir, a), hidden=False, local=local)
    per, score = runner.category_scores(run.results, cfg["weights"])
    _print_results(run, per, score)
    if a.verbose:
        print(run.log)


def cmd_score(a):
    cdir = find(a.challenge)
    cfg = load_cfg(cdir)
    local = _mode(a)
    sol = _solution(cdir, a)
    print(f"Running public + hidden tests for {cdir.name}...")
    run = runner.run_tests(cdir, cfg, sol, hidden=True, local=local)
    per, tests_score = runner.category_scores(run.results, cfg["weights"])
    _print_results(run, per, tests_score)
    if a.verbose:
        print(run.log)
    w = cfg.get("score", {"tests": 70, "judge": 30})
    judge_score, verdict = None, None
    if not a.no_judge:
        with vault.open_vault(cdir.name, cdir / "vault.bin") as zf:
            rubric = zf.read("rubric.md").decode()
        summary = "\n".join(f"{r.category} {r.name}: {'pass' if r.passed else 'FAIL ' + r.message}" for r in run.results)
        print(f"\nAsking the LLM judge ({a.judge})...")
        try:
            verdict = judge.judge((cdir / "README.md").read_text(encoding="utf-8"), rubric, sol, summary, a.judge)
            judge_score = max(0.0, min(100.0, float(verdict.get("total", 0))))
        except (judge.JudgeError, OSError, ValueError) as exc:
            print(f"  judge unavailable: {exc}")
    if verdict:
        for name, c in verdict.get("criteria", {}).items():
            print(f"  {name:<28} {c.get('score', '?'):>2}/10  {c.get('reason', '')}")
        for s in verdict.get("strengths", []):
            print(f"  + {s}")
        for s in verdict.get("weaknesses", []):
            print(f"  - {s}")
        print(f"  judge score: {judge_score:.1f}/100\n  {verdict.get('summary', '')}")
    if judge_score is None:
        final = tests_score
        print(f"\nFINAL (tests only): {final:.1f}/100")
    else:
        final = (tests_score * w["tests"] + judge_score * w["judge"]) / (w["tests"] + w["judge"])
        print(f"\nFINAL: {final:.1f}/100  (tests {w['tests']}% + judge {w['judge']}%)")
    if a.solution:
        return
    PROGRESS.mkdir(exist_ok=True)
    hist = history(cdir.name)
    hist.append({"at": dt.datetime.now().isoformat(timespec="seconds"), "tests": round(tests_score, 1),
                 "judge": None if judge_score is None else round(judge_score, 1), "final": round(final, 1),
                 "frozen": run.frozen, "categories": per, "verdict": verdict})
    (PROGRESS / f"{cdir.name}.json").write_text(json.dumps(hist, indent=2))
    print(f"Saved attempt #{len(hist)}. When you are done: python ch.py reveal {cdir.name}")


def cmd_reveal(a):
    cdir = find(a.challenge)
    if not history(cdir.name) and not a.force:
        die("no scored attempt yet. Score first, or pass --force to give up and reveal.")
    dest = WORKSPACE / cdir.name / ".revealed"
    if dest.exists():
        shutil.rmtree(dest)
    names = vault.extract(cdir.name, cdir / "vault.bin", dest)
    print(f"Revealed {len(names)} files into {dest}")
    for n in sorted(names):
        print(f"  {n}")
    print(f"Start with {dest / 'SOLUTION.md'}")


def cmd_seal(a):
    targets = all_challenges() if a.challenge == "all" else [find(a.challenge)]
    for cdir in targets:
        src = VAULT_SRC / cdir.name
        if not src.exists():
            die(f"missing {src}")
        for required in ("rubric.md", "SOLUTION.md"):
            if not (src / required).exists():
                die(f"{src / required} is required")
        size = vault.seal(cdir.name, src, cdir / "vault.bin")
        print(f"sealed {cdir.name}: {size} bytes -> {cdir / 'vault.bin'}")


def main():
    p = argparse.ArgumentParser(prog="ch", description="System design challenges: build, test, score, reveal.")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="list challenges and your best scores").set_defaults(fn=cmd_list)
    s = sub.add_parser("start", help="copy the starter kit into workspace/")
    s.add_argument("challenge")
    s.add_argument("--reset", action="store_true", help="overwrite an existing workspace")
    s.set_defaults(fn=cmd_start)
    for name, fn, helptext in (("test", cmd_test, "run public tests only (fast feedback)"),
                               ("score", cmd_score, "run all tests + LLM judge and record the attempt")):
        t = sub.add_parser(name, help=helptext)
        t.add_argument("challenge")
        t.add_argument("--local", action="store_true", help="run without Docker on the host (unfrozen)")
        t.add_argument("--solution", help="score another directory (not recorded)")
        t.add_argument("-v", "--verbose", action="store_true", help="print the full test log")
        if name == "score":
            t.add_argument("--no-judge", action="store_true", help="skip the LLM judge")
            t.add_argument("--judge", choices=["cli", "api"], default="cli",
                           help="cli = claude -p (default), api = ANTHROPIC_API_KEY")
        t.set_defaults(fn=fn)
    r = sub.add_parser("reveal", help="decrypt the reference solution, rubric and hidden tests")
    r.add_argument("challenge")
    r.add_argument("--force", action="store_true", help="reveal without a scored attempt")
    r.set_defaults(fn=cmd_reveal)
    m = sub.add_parser("seal", help="maintainers: encrypt .vault-src/<id> into vault.bin")
    m.add_argument("challenge", help="challenge id or 'all'")
    m.set_defaults(fn=cmd_seal)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
