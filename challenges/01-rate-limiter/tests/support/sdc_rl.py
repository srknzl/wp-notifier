"""Harness-provided types and test doubles. Your solution imports Decision, SharedStore,
StoreUnavailable and UnknownTenant from here. Do not modify: the harness ships its own copy."""
import json
import math
import random
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional


@dataclass(frozen=True)
class Decision:
    allowed: bool
    remaining: int
    retry_after: Optional[float]


class StoreUnavailable(Exception):
    pass


class UnknownTenant(Exception):
    pass


class FakeClock:
    def __init__(self, start: float = 1_000_000.0, offset: float = 0.0, base: "FakeClock | None" = None):
        self._t = start
        self._offset = offset
        self._base = base
        self._lock = threading.Lock()

    def __call__(self) -> float:
        if self._base is not None:
            return self._base() + self._offset
        with self._lock:
            return self._t

    def advance(self, seconds: float) -> None:
        with self._lock:
            self._t += seconds

    def skewed(self, offset: float) -> "FakeClock":
        return FakeClock(offset=offset, base=self)


class SharedStore:
    """A remote key-value store with versioned compare-and-set and TTLs.

    Values are JSON round-tripped on every call, so you cannot share Python objects
    through it. Every call may raise StoreUnavailable; a call that raised was not applied.
    """

    def __init__(self, clock: Callable[[], float], fail_rate: float = 0.0, seed: int = 7,
                 interleave: bool = False):
        self._clock = clock
        self._data: dict[bytes, tuple[str, int, float]] = {}
        self._lock = threading.Lock()
        self._rng = random.Random(seed)
        self._version = 0
        self.fail_rate = fail_rate
        self.down = False
        self.interleave = interleave
        self.calls = {"get": 0, "cas": 0, "delete": 0}
        self.failures = 0

    def _enter(self, op: str) -> None:
        if self.interleave:
            time.sleep(0)
        with self._lock:
            self.calls[op] += 1
            fail = self.down or (self.fail_rate > 0 and self._rng.random() < self.fail_rate)
            if fail:
                self.failures += 1
        if fail:
            raise StoreUnavailable(op)

    def _live(self, key: bytes, now: float):
        item = self._data.get(key)
        if item is None:
            return None
        if item[2] <= now:
            del self._data[key]
            return None
        return item

    def get(self, key: str) -> tuple[Any, int]:
        self._enter("get")
        with self._lock:
            item = self._live(key.encode(), self._clock())
            result = (None, 0) if item is None else (json.loads(item[0]), item[1])
        if self.interleave:
            time.sleep(0)
        return result

    def cas(self, key: str, expected_version: int, value: Any, ttl: float) -> bool:
        payload = json.dumps(value)
        if not (isinstance(ttl, (int, float)) and math.isfinite(ttl) and ttl > 0):
            raise ValueError("ttl must be a positive finite number of seconds")
        self._enter("cas")
        with self._lock:
            now = self._clock()
            k = key.encode()
            item = self._live(k, now)
            current = 0 if item is None else item[1]
            if current != expected_version:
                return False
            self._version += 1
            self._data[k] = (payload, self._version, now + ttl)
            return True

    def delete(self, key: str) -> None:
        self._enter("delete")
        with self._lock:
            self._data.pop(key.encode(), None)

    def live_keys(self) -> int:
        with self._lock:
            now = self._clock()
            for k in [k for k, v in self._data.items() if v[2] <= now]:
                del self._data[k]
            return len(self._data)

    def total_calls(self) -> int:
        return sum(self.calls.values())


class IdealBucket:
    """Reference model for the liveness rule: one caller, one clock."""

    def __init__(self, rate: float, burst: int, now: float):
        self.rate, self.burst, self.tokens, self.t = rate, burst, float(burst), now

    def reconfigure(self, rate: float, burst: int, now: float) -> None:
        self._refill(now)
        self.rate, self.burst = rate, burst
        self.tokens = min(self.tokens, float(burst))

    def _refill(self, now: float) -> None:
        if now > self.t:
            self.tokens = min(float(self.burst), self.tokens + (now - self.t) * self.rate)
            self.t = now

    def acquire(self, cost: int, now: float) -> tuple[bool, int, Optional[float]]:
        self._refill(now)
        if cost > self.burst:
            return False, math.floor(self.tokens + 1e-9), None
        if self.tokens + 1e-9 >= cost:
            self.tokens -= cost
            return True, math.floor(self.tokens + 1e-9), 0.0
        return False, math.floor(self.tokens + 1e-9), (cost - self.tokens) / self.rate


def max_envelope_excess(events: list[tuple[float, int]], rate: float) -> float:
    """events: (true_time, cost) of admitted requests. Returns max over all intervals of
    admitted_cost - rate * interval_length. The contract requires this to be <= burst."""
    if not events:
        return 0.0
    events = sorted(events)
    best, min_prefix, prefix = -math.inf, math.inf, 0.0
    for t, cost in events:
        min_prefix = min(min_prefix, prefix - rate * t)
        prefix += cost
        best = max(best, (prefix - rate * t) - min_prefix)
    return best
