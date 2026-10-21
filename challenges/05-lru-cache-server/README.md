# 05 · Memory-Bounded LRU Cache Server

**Language:** Java 21 (JDK only, compiled with `javac`) · **Level:** medium-hard ·
**Time box:** 3–4 hours

## Story

Your team runs a small in-house cache in front of a slow catalog service. It must hold as
much as fits in a fixed memory budget, keep the hottest items, honour TTLs, and serve
hundreds of connections at once. Last month a naive version grew until the JVM died with
`OutOfMemoryError` during a traffic spike, and a slow client froze every other client.

## What You Build

`src/Cache.java` with `public static void main`, built with
`javac -d out --source-path src src/Cache.java` (put other classes in `src/` too) and started as:

```
java -Xmx192m -cp out Cache --port <port> --max-bytes <n>
```

It listens on `127.0.0.1:<port>`. Each connection sends commands, one per line ending in
`\n`. Every command gets exactly one reply line, in order. Clients pipeline: they may send
thousands of commands before reading any reply.

| Command | Reply |
|---|---|
| `SET <key> <ttl_ms> <value>` | `OK` · `ERR too_large` |
| `GET <key>` | `VALUE <value>` · `MISS` |
| `DEL <key>` | `DELETED` · `MISS` |
| `INCR <key>` | `VALUE <n>` · `ERR not_integer` |
| `STATS` | `STATS items=<n> bytes=<b> hits=<h> misses=<m> evictions=<e> expired=<x>` |
| anything else | `ERR <reason>` |

Keys are 1–250 printable ASCII characters with no spaces. A value is everything after the
third space, 1 byte to 1 MiB, with no newline (it may contain spaces). Treat bytes as
ISO-8859-1. `ttl_ms` is a non-negative integer; `0` means the item never expires.

## The Contract

1. **Accounting.** An item costs `len(key) + len(value) + 64` bytes. `bytes` in `STATS` is
   the sum over stored items and never exceeds `--max-bytes`. An item that alone exceeds it
   gets `ERR too_large` and changes nothing.
2. **LRU eviction.** When a `SET` or `INCR` needs room, the least recently used items go
   first. A `GET` hit, `SET` and `INCR` count as use. `evictions` counts them.
3. **TTL.** An expired item is never returned. Expired items are reclaimed within one second
   even if nobody touches them again. `expired` counts them. `SET` replaces the TTL; `INCR`
   keeps it. `INCR` on a missing key stores `1` with no TTL; on a value that is not a signed
   64-bit integer, or would overflow, it replies `ERR not_integer`.
4. **Atomicity.** Every command is atomic. Concurrent `INCR`s never lose updates; a `GET`
   returns a value exactly as some `SET` stored it.
5. **Memory.** The JVM runs with `-Xmx192m` and `--max-bytes` up to 32 MiB. It must never
   throw `OutOfMemoryError`, whatever clients send: floods of 1 MiB values, millions of tiny
   items, hundreds of idle connections.
6. **Isolation.** A client that pipelines commands but never reads replies must not slow
   down other clients.
7. **Throughput.** Hundreds of thousands of pipelined commands across a few connections in
   seconds; cost per command independent of the item count.
8. **Hit ratio.** On a skewed (Zipf) workload, hits must be close to those of an exact LRU
   with the same byte budget.

## Rules

- JDK only, no external jars. Any JDK class is fine (virtual threads, NIO, `java.util.concurrent`).
- Write `APPROACH.md`: data structures and their costs, the locking or concurrency design and
  why it is atomic, how expiry works, how memory stays bounded, and how you would scale it
  across machines. It is graded.

## Commands

```
python ch.py start 05 · python ch.py test 05 · python ch.py score 05 · python ch.py reveal 05
```

Final score = 70% hidden tests (correctness, concurrency, memory, scalability) + 30% review.
