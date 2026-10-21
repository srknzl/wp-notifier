from typing import Callable

from sdc_rl import Decision, SharedStore, StoreUnavailable, UnknownTenant


class RateLimiter:
    def __init__(self, store: SharedStore, clock: Callable[[], float]):
        self.store = store
        self.clock = clock

    def configure(self, tenant: str, rate: float, burst: int, fail_mode: str = "closed") -> None:
        raise NotImplementedError

    def acquire(self, tenant: str, key: str, cost: int = 1) -> Decision:
        raise NotImplementedError
