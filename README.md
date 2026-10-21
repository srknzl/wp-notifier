# System Design Challenges

Realistic components with hard edges — concurrency, partial failure, bounded memory, clock
skew. Each one is solvable many ways. Your solution is scored by hidden deterministic tests
inside a frozen container, plus an LLM reviewer that reads your code and your written
approach. The reference solution stays encrypted until you ask for it.

## Requirements

- Python 3.11+ on the host (the harness uses only the standard library)
- Docker (each challenge runs in its own image, pinned by digest, with no network)
- For the LLM review: the `claude` CLI signed in, or `ANTHROPIC_API_KEY` with `--judge api`

## Quick Start

```
python ch.py list
python ch.py start 01
# edit workspace/01-rate-limiter/, write APPROACH.md
python ch.py test 01           # public tests, fast feedback
python ch.py score 01          # all tests + LLM review, recorded in .progress/
python ch.py reveal 01         # reference solution, rubric, hidden tests
```

`--local` runs tests on the host instead of Docker. The result is marked unfrozen and is not
comparable. `--no-judge` skips the LLM review.

## Challenges

| ID | Language | Focus |
|---|---|---|
| 01-rate-limiter | Python | Distributed token bucket over a CAS-only store: exactness under contention, flaky store, clock skew, TTL-bounded memory |
| 02-crash-safe-kv | Rust | Log-structured KV store: durable acks, atomic recovery after kill -9, torn-write handling, bounded disk via crash-safe compaction |
| 03-job-queue | Python | Fair multi-tenant queue with leases: at-least-once delivery, lease expiry and fencing tokens, per-tenant fairness, bounded memory |
| 04-event-ledger | TypeScript (Node 24) | Event-sourced ledger: no double spend, idempotency keys, group commit with an fsync barrier, crash recovery |
| 05-lru-cache-server | Java 21 | TCP cache server: exact LRU under a byte budget, TTL sweeping, atomic INCR, `-Xmx192m` without OOM, slow-client isolation |
| 06-coalescing-proxy | C# (.NET 10) | HTTP proxy: request coalescing, stale-while-revalidate, bounded backend concurrency, timeouts, circuit breaker with one probe |

## Scoring

- **Tests (70%)**: weighted by category, e.g. correctness, concurrency, reliability,
  scalability. Weights live in each `challenge.toml`. Hidden test names and their first
  failure line are shown, but not their code.
- **Review (30%)**: a rubric per challenge. The submission is passed to the reviewer as
  untrusted data; instructions inside it are ignored.

## How Solutions Are Hidden

`challenges/*/vault.bin` holds the hidden tests, the reference solution and the rubric,
encrypted with a SHA-256 stream cipher and authenticated with HMAC. The key is derived inside
the harness. This stops anyone from reading a solution by opening a file. It does not stop a
determined reader of the harness code. This is an honour system with a lock on the door.

## For Maintainers

Plain sources live in `.vault-src/<id>/` (git-ignored, back them up yourself):
`hidden/`, `solution/`, `naive/`, `rubric.md`, `SOLUTION.md`. After editing:

```
python ch.py seal 01
python ch.py score 01 --local --no-judge --solution .vault-src/01-rate-limiter/solution   # must be 100
python ch.py score 01 --local --no-judge --solution .vault-src/01-rate-limiter/naive      # must be low
```

A new challenge needs `challenge.toml`, `README.md`, `Dockerfile` (pinned by digest),
`starter/`, `tests/public/`, and test names that start with `test_<category>_`.
