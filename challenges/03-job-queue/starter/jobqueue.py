from sdc_jq import DeadJob, Lease


class JobQueue:
    def __init__(self, clock, *, visibility_timeout=30.0, max_attempts=5, backoff_base=1.0,
                 backoff_max=60.0, dedupe_window=3600.0, dead_letter_limit=1000):
        self.clock = clock

    def enqueue(self, tenant, payload, *, key=None, delay=0.0, priority=0) -> str:
        raise NotImplementedError

    def claim(self, worker) -> Lease | None:
        raise NotImplementedError

    def ack(self, lease: Lease) -> bool:
        raise NotImplementedError

    def nack(self, lease: Lease, error: str = "") -> bool:
        raise NotImplementedError

    def extend(self, lease: Lease) -> bool:
        raise NotImplementedError

    def dead_letters(self, tenant) -> list[DeadJob]:
        raise NotImplementedError

    def stats(self) -> dict:
        raise NotImplementedError
