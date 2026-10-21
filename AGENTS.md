# System Design Challenges

Terminal-only challenge platform. `ch.py` is the CLI; `harness/` runs tests (Docker or --local), judges with an LLM, and seals solutions.

- `challenges/<id>/`: public part of a challenge. `vault.bin` is encrypted, never edit by hand.
- `.vault-src/<id>/`: plaintext hidden tests, reference, naive, rubric. Git-ignored; never commit.
- After changing `.vault-src`, run `python ch.py seal <id>` and re-score reference (100) and naive (low).
- Test names: `test_<category>_...`, categories from `challenge.toml` [weights].
- Harness is stdlib-only Python 3.11+. Plan: docs/plan.md.
