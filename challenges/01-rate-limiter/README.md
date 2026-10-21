# 01 · Multi-Tenant Distributed Rate Limiter

**Language:** Python 3.12 · **Level:** medium · **Time box:** 2–4 hours

## Story

You run a public API behind a fleet of stateless app servers. Every server embeds a rate
limiter library. All servers share one key-value store (think Redis/DynamoDB), which is the
**only** shared state. Tenants buy a plan: a sustained rate and a burst allowance. Your
library decides, for every incoming request, whether to admit it.

Your limiter must be exact under concurrency, survive a flaky store, use bounded memory with
millions of distinct keys, and stay cheap on the store.

## What You Build

`limiter.py` in your workspace must export a class `RateLimiter`:

```python
from sdc_rl import Decision, SharedStore, UnknownTenant

class RateLimiter:
    def __init__(self, store: SharedStore, clock: Callable[[], float]): ...
    def configure(self, tenant: str, rate: float, burst: int, fail_mode: str = "closed") -> None: ...
    def acquire(self, tenant: str, key: str, cost: int = 1) -> Decision: ...
```

`sdc_rl` (in `tests/support/`, provided by the harness, read it) defines:

- `Decision(allowed: bool, remaining: int, retry_after: float | None)`
- `SharedStore` — the shared store. It offers **only**:
  - `get(key) -> (value, version) | (None, 0)`
  - `cas(key, expected_version, value, ttl) -> bool` — writes only if the current version
    equals `expected_version` (`0` means "key must not exist"). `ttl` is seconds; the key
    expires after it. Values must be JSON-serialisable; they are copied on every call.
  - `delete(key)`.
  Any call may raise `StoreUnavailable`. The store never applies a call that raised.
- `UnknownTenant` — raise it from `acquire` for a tenant that was never configured.

Several `RateLimiter` instances (one per app server) share one store. Each instance has its
own `clock` (seconds, float). Clocks of different instances may disagree by up to 1 second.
Every instance is configured identically by the caller.

## The Contract

A tenant is configured with `rate` (units per second, > 0) and `burst` (integer ≥ 1). Each
`(tenant, key)` pair is limited independently.

1. **Envelope (safety).** Over any time interval of length `t`, the admitted cost for one
   `(tenant, key)` never exceeds `burst + rate * t` — across **all** instances and threads.
   A fresh key starts full: `burst` may be admitted at once.
2. **Liveness.** With a single caller and a single clock, a request is admitted whenever an
   ideal token bucket with these parameters would admit it (float tolerance 1e-6).
3. **`remaining`** is the number of whole units that could be admitted immediately after
   this decision. **`retry_after`** is `0` when allowed. When denied, it is the number of
   seconds after which the same request would be admitted if nothing else happened; if
   `cost > burst`, the request can never succeed, so `retry_after` is `None`.
4. **Reconfiguration** takes effect on the next `acquire`. A key keeps its current level
   (tokens); the new rate applies to the time elapsed since the key was last updated.
   Lowering `burst` must not let a key keep more than the new `burst` in reserve.
5. **Failures.** `acquire` never raises because of the store. It retries a bounded number of
   times, then applies `fail_mode`: `"closed"` denies (`retry_after` = 1.0), `"open"`
   admits. A fully dead store must not make `acquire` slow (no sleeping for seconds).
6. **Concurrency.** `acquire` is called from many threads and many instances at once.
7. **Memory.** State for an idle key must disappear from the store on its own once keeping
   it no longer changes any decision. The process must not grow with the number of keys.
8. **Cost.** The store is remote. Uncontended, one `acquire` should cost about two store
   round-trips.

## Rules

- Use any library from PyPI: add it to `requirements.txt` in your workspace. Tests run with
  no network access.
- Write `APPROACH.md`: your algorithm, why it meets each point of the contract, what you
  traded off, what breaks first in production and how you would monitor it. It is graded.

## Commands

```
python ch.py start 01         # copy the starter kit to workspace/01-rate-limiter
python ch.py test 01          # public tests (fast)
python ch.py score 01         # public + hidden tests + LLM review, recorded
python ch.py reveal 01        # reference solution, rubric, hidden tests
```

## Scoring

Hidden tests cover correctness, concurrency, reliability and scalability; their weights
are in `challenge.toml`. The LLM reviewer reads your code and `APPROACH.md` against a rubric.
Final score = 70% tests + 30% review.
