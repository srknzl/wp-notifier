# Harness

- `vault.py`: seal/open `vault.bin` (SHA-256 counter stream + HMAC, key from challenge id).
- `runner.py`: stage public + hidden tests in a temp dir, run in Docker (`--network none`) or locally, parse JUnit XML, score by category.
- `judge.py`: build rubric prompt, call `claude -p` or the Messages API, parse JSON verdict.
