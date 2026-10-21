# 04 · Event-Sourced Ledger Service

**Language:** TypeScript on Node 24 (`node --experimental-strip-types`, no build step) ·
**Level:** medium-hard · **Time box:** 3–5 hours

## Story

A wallet service holds customer balances. Every change is an event in an append-only log, and
the balances are just a replay of it. Mobile clients retry on flaky networks, so every write
carries an idempotency key. Load spikes send hundreds of concurrent transfers from the same
account. Money must never be created, destroyed or spent twice, and the process may be
killed at any moment.

## What You Build

`src/server.ts`, started as:

```
node --experimental-strip-types src/server.ts --port <port> --data <dir>
```

It serves HTTP/1.1 JSON on `127.0.0.1:<port>` and keeps all its files in `<dir>`. Bodies and
responses are JSON objects. Account ids match `[A-Za-z0-9_-]{1,64}`. Amounts are integers in
`1..1e12`. Keys are strings of 1–128 characters.

| Request | Success | Errors |
|---|---|---|
| `GET /health` | `200 {}` once ready | |
| `POST /accounts {"account"}` | `201 {"account", "balance": 0}` | `400`, `409 exists` |
| `POST /deposits {"account", "amount", "key"}` | `200 {"tx"}` | `400`, `404 unknown_account`, `422 key_reused` |
| `POST /transfers {"from", "to", "amount", "key"}` | `200 {"tx"}` | `400` (also `from == to`), `404 unknown_account`, `409 insufficient_funds`, `422 key_reused` |
| `GET /accounts/<id>` | `200 {"account", "balance"}` | `404 unknown_account` |
| `GET /events?after=<n>&limit=<m>` | `200 {"events": [...], "last"}` | `400` |
| `GET /audit` | `200 {"total", "deposited", "events"}` | |

Error bodies are `{"error": "<code>"}`; the code column shows the code to use.

**Events** have consecutive `seq` numbers starting at 1, in the order they took effect:
`{"seq", "type": "account_created", "account"}`,
`{"seq", "type": "deposit", "account", "amount", "key"}` and
`{"seq", "type": "transfer", "from", "to", "amount", "key"}`.
`tx` in a response is the `seq` of the event it created. `/events` returns events with
`seq > after`, oldest first, at most `limit` of them (default 100, max 1000). `last` is the
highest seq. `/audit` returns the sum of all balances, the sum of all deposits and the event count.

## The Contract

1. **No double spend.** A balance never goes below zero, however many transfers race.
2. **Idempotency.** A deposit or transfer that repeats a key with the same body returns the
   original `200 {"tx"}` and changes nothing. The same key with a different body gets `422`.
   Keys are global and are never forgotten, across restarts too. A request that was rejected
   (4xx) is not recorded, so a retry is evaluated again.
3. **Durability.** A `2xx` on a write means its event is in the log and survives `kill -9`
   right after. Reads never show an event that is not yet durable.
4. **Log is the truth.** After a restart, `/events` returns exactly the same events, and
   every balance equals the replay of those events.
5. **Conservation.** At every instant `/audit` shows `total == deposited`.
6. **Torn writes.** After a crash, the harness may append random bytes to the most recently
   modified regular file in `<dir>`. Startup treats them as an incomplete write, keeps every
   complete event, and serves normally.
7. **Throughput.** Hundreds of concurrent clients, thousands of transfers per run. Startup
   with tens of thousands of events takes about a second.

## Rules

- Node built-ins only: no `npm install`, no external database. `node:sqlite` is not allowed.
- Write `APPROACH.md`: how writes are ordered and when they become durable, why concurrent
  transfers cannot double spend in your design, the log format and recovery, and what you
  would change for many service instances. It is graded.

## Commands

```
python ch.py start 04 · python ch.py test 04 · python ch.py score 04 · python ch.py reveal 04
```

Final score = 70% hidden tests (correctness, concurrency, durability, scalability) + 30% review.
