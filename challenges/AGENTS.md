# challenges/

One folder per challenge: `challenge.toml` (language, build/run/test commands, category weights), `README.md` (the contract), `Dockerfile` (pinned by digest), `starter/`, `tests/` (public tests + `support/` helpers), `vault.bin` (sealed hidden tests, reference, rubric).

- Never edit `vault.bin`; edit `.vault-src/<id>/` and run `python ch.py seal <id>`.
- Servers in tests bind ports 20000-32000 and are killed by an autouse/fixture `kill_all()` (Windows leaks otherwise).
- Build output (`out/`, `bin/`, `obj/`, `target/`, `node_modules/`) is never sealed or committed.
- 02 Rust, 04 TypeScript, 05 Java, 06 C#: the host needs that toolchain for `--local`.
