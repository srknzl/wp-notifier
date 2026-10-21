# 02 · Crash-Safe Key-Value Store

**Language:** Rust (stable, edition 2021) · **Level:** hard · **Time box:** 4–6 hours

## Story

You are writing the storage engine under a metadata service. The process is killed without
warning (OOM killer, deploys, `kill -9`) many times a day. Whatever it acknowledged must
survive. It must also restart fast and must not fill the disk, even though clients
overwrite the same keys all day.

## What You Build

A binary built with `cargo build --release`, started as:

```
target/release/kv <data_dir>
```

It owns `<data_dir>` (created if missing) and speaks a line protocol on stdin/stdout. One
command per line, one response line per command, responses in command order:

| Command | Response |
|---|---|
| `PUT <key> <value>` | `OK` |
| `GET <key>` | `VALUE <value>` or `NONE` |
| `DEL <key>` | `OK` (also when the key did not exist) |
| anything else | `ERR <message>` |

Keys match `[A-Za-z0-9_.-]{1,200}`. Values are 1–65536 printable ASCII characters without
spaces. EOF on stdin means a clean shutdown.

## The Contract

1. **Durability.** Once `OK` is written for a `PUT`/`DEL`, the effect survives the process
   being killed at any instant after that, and survives an OS crash. (`flush` is not enough.)
2. **Atomicity.** After a crash, every key holds either its last acknowledged value or the
   value of a later write that was in flight. Never a mix, never garbage, never an older
   value.
3. **Torn writes.** After a crash, the harness may append random bytes to the most recently
   modified regular file in `<data_dir>`, which simulates a half-written record. Recovery must
   treat them as an incomplete write and start normally. Startup must never fail on a torn tail.
4. **Bounded disk.** Disk use must stay within a small multiple of the live data, plus a
   constant, no matter how many overwrites and deletes happen. Deleted keys must stay deleted
   through any amount of cleanup and restarts.
5. **Throughput.** Clients pipeline: they send many commands before reading responses. A
   pipelined burst of 20,000 `PUT`s must finish in seconds, on a disk where one `fsync`
   costs milliseconds. In the frozen container every `fsync`/`fdatasync` your process makes
   is delayed by 2 ms and counted.
6. **Startup.** Restart time depends on live data, not on the history of writes.
7. **Crash during anything.** A crash can come during cleanup, rotation or restart too.

## Rules

- Any crate from crates.io (`Cargo.toml`). The build step has network access; tests do not.
- Single process, no external database. `sled`, `rocksdb` and similar storage engines are not
  allowed: the point is to build one. Checksums, serialization and similar helpers are fine.
- Write `APPROACH.md`: file layout, recovery algorithm, when you `fsync` and why, how cleanup
  stays crash-safe, what you would change for 100 GB of data. It is graded.

## Commands

```
python ch.py start 02 · python ch.py test 02 · python ch.py score 02 · python ch.py reveal 02
```

Final score = 70% hidden tests (correctness, durability, scalability) + 30% review.
