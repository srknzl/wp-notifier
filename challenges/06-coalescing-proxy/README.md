# 06 · Coalescing Caching HTTP Proxy

**Language:** C# 13 / .NET 10 (ASP.NET Core shared framework, no NuGet packages) ·
**Level:** hard · **Time box:** 4 hours

## Story

The product page calls a pricing service that answers in 300 ms on a good day. When a
popular item goes on sale, ten thousand browsers ask for the same price at once and the
pricing service falls over. When it is down, every request hangs for a minute and takes the
web tier with it. You put a small proxy in front of it.

## What You Build

A project in the solution folder whose assembly is `Proxy` (keep the given `Proxy.csproj`),
built with `dotnet build -c Release -o out` and started as:

```
dotnet out/Proxy.dll --port <p> --backend http://127.0.0.1:<b> --ttl-ms <t> --stale-ms <s>
    --timeout-ms <ms> --max-inflight <n> --failure-threshold <f> --cooldown-ms <c>
```

It listens on `127.0.0.1:<port>`. `GET /__health` answers `200` without touching the
backend. Every other `GET <path>?<query>` is forwarded to `<backend><path>?<query>`; the
cache key is the path plus the query string. Other methods get `405`. Every proxied
response carries `X-Cache: HIT | STALE | MISS`.

## The Contract

1. **Pass-through.** Status, body (binary, up to a few MiB) and `Content-Type` of the backend
   response are returned unchanged.
2. **Caching.** Only `200` responses are cached. A cached entry is fresh for `ttl-ms`
   (`HIT`, no backend call), then stale for `stale-ms` more, then gone.
3. **Coalescing.** While a backend call for a key is in flight, every other request for that
   key waits for it: N concurrent requests for one key make exactly one backend call and get
   the same answer, errors included. A waiting client that disconnects must not cancel the
   call for the others. Different keys never wait on each other.
4. **Stale-while-revalidate.** A request for a stale entry is answered at once from the stale
   copy (`STALE`) and starts one background refresh for that key, no matter how many stale
   requests arrive. A failed refresh keeps the stale copy.
5. **Bounded backend concurrency.** At most `max-inflight` backend calls are open at once;
   the rest queue.
6. **Timeouts.** A backend call (queueing included) that takes longer than `timeout-ms` is
   abandoned, and everyone waiting on it gets `504`. Connection failures give `502`.
7. **Circuit breaker.** `failure-threshold` consecutive failed backend calls (a `5xx`, a
   timeout or a connection failure; `4xx` is not a failure) open the breaker: for
   `cooldown-ms` misses get `503` at once without calling the backend, while fresh and stale
   cache entries are still served. After the cooldown exactly one call is let through as a
   probe while the others still get `503`; success closes the breaker, failure opens it for
   another cooldown. Any success resets the consecutive count.
8. **Isolation.** Cache hits stay fast while slow misses are queued.

## Rules

- Only the .NET base library and the ASP.NET Core shared framework; no package references.
- Write `APPROACH.md`: how coalescing works and why it cannot make two calls for one key, the
  cache and stale lifecycle, the breaker state machine, where timeouts and cancellation flow,
  and how you would run many proxy instances (shared cache? request collapsing across nodes?).
  It is graded.

## Commands

```
python ch.py start 06 · python ch.py test 06 · python ch.py score 06 · python ch.py reveal 06
```

Final score = 70% hidden tests (correctness, coalescing, resilience, scalability) + 30% review.
