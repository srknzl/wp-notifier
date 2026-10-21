# 03 · Fair Job Queue With Leases

**Language:** Python 3.12 · **Level:** medium-hard · **Time box:** 3–5 hours

## Story

Your platform runs background jobs for thousands of tenants: exports, webhooks, thumbnails.
Workers crash, hang and retry. One tenant sometimes dumps a million jobs at once, and the
others must not wait behind it. You own the queue core that a worker pool of many threads
calls into.

## What You Build

`jobqueue.py` in your workspace must export `JobQueue`:

```python
from sdc_jq import Lease, DeadJob

class JobQueue:
    def __init__(self, clock, *, visibility_timeout=30.0, max_attempts=5,
                 backoff_base=1.0, backoff_max=60.0, dedupe_window=3600.0,
                 dead_letter_limit=1000): ...
    def enqueue(self, tenant: str, payload, *, key: str | None = None,
                delay: float = 0.0, priority: int = 0) -> str: ...
    def claim(self, worker: str) -> Lease | None: ...
    def ack(self, lease: Lease) -> bool: ...
    def nack(self, lease: Lease, error: str = "") -> bool: ...
    def extend(self, lease: Lease) -> bool: ...
    def dead_letters(self, tenant: str) -> list[DeadJob]: ...
    def stats(self) -> dict: ...
```

`sdc_jq` (in `tests/support/`, read it) defines the frozen dataclasses
`Lease(job_id, tenant, payload, attempt, deadline, token)` and
`DeadJob(job_id, tenant, payload, attempts, error)`, plus `FakeClock`. `clock()` returns
seconds as a float and never goes backwards. Time passes only when the clock says so.

## The Contract

1. **Delivery.** `enqueue` returns a new job id (a string). A job is *ready* once
   `clock() >= enqueue time + delay`. `claim` returns a ready job as a `Lease` and makes it
   invisible until `deadline = now + visibility_timeout`, or returns `None` if nothing is
   ready. `payload` is returned as the same object. `attempt` is 1 on the first claim and
   grows by one on each later claim.
2. **Leases and fencing.** A lease is *valid* while `clock() < deadline` and the job has not
   been claimed again since. `ack` (done, forget it), `nack` and `extend` return `True` only
   for a valid lease. Otherwise they change nothing and return `False`. A stale worker can
   never complete or release a job someone else holds. Each claim gets a fresh `token`.
   `extend` sets `deadline = now + visibility_timeout`.
3. **At-least-once.** When a lease expires, the job becomes ready again at `deadline`. Nothing
   that was enqueued is lost unless it was acked or dead-lettered.
4. **Retries.** `nack` makes the job ready again after
   `min(backoff_max, backoff_base * 2 ** (attempt - 1))` seconds.
5. **Poison jobs.** When an attempt numbered `max_attempts` fails (nack, or the lease
   expires), the job is moved to dead letters instead of being retried, with
   `error` = the nack's error, or `"timeout"`. `dead_letters(tenant)` lists them, oldest first,
   keeping at most `dead_letter_limit` per tenant (the newest). They are never delivered again.
6. **Idempotent enqueue.** For the same `(tenant, key)`, enqueues within `dedupe_window`
   seconds of the first one return the first job's id and add nothing, even if that job
   was already acked. After the window, the key is new again. `key=None` never dedupes.
7. **Order inside a tenant.** Higher `priority` first. Equal priority: the job that became
   ready earlier first. Equal time: enqueue order.
8. **Fairness across tenants.** `claim` serves tenants round-robin. Among tenants that keep
   having ready jobs, no tenant gets a second job before each of the others got one. A
   tenant that becomes ready joins the rotation at the end, so it waits for at most one
   claim per other tenant.
9. **Concurrency.** Many threads call every method at once. No job is held by two valid
   leases, and every job is acked successfully at most once.
10. **Scale.** `enqueue`, `claim`, `ack`, `nack`, `extend` cost O(log n), where n counts jobs,
    tenants and leases. Expired leases and due delays are processed lazily at their time, not
    by scanning. 100,000 jobs over 5,000 tenants must flow through in seconds.
11. **Memory.** Acked jobs and expired dedupe keys are forgotten. Memory follows live jobs,
    live keys and kept dead letters, not history.
12. **`stats()`** returns `{"ready": int, "delayed": int, "inflight": int, "dead": int}` as
    of `clock()`. *delayed* counts jobs waiting for a delay or backoff. *inflight* counts
    valid leases. *dead* counts kept dead letters.

## Rules

- Standard library plus anything you list in `requirements.txt`. No external services.
- Write `APPROACH.md`: data structures and why each operation is O(log n), how fencing works,
  the fairness argument, what you would change to run this across many machines. It is graded.

## Commands

```
python ch.py start 03 · python ch.py test 03 · python ch.py score 03 · python ch.py reveal 03
```

Final score = 70% hidden tests (correctness, reliability, concurrency, scalability) + 30% review.
