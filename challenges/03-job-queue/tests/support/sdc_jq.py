"""Provided by the harness for 03. Do not edit: the hidden tests use this exact file."""
import threading
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Lease:
    job_id: str
    tenant: str
    payload: Any
    attempt: int
    deadline: float
    token: int


@dataclass(frozen=True)
class DeadJob:
    job_id: str
    tenant: str
    payload: Any
    attempts: int
    error: str


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self._now = start
        self._lock = threading.Lock()

    def __call__(self) -> float:
        with self._lock:
            return self._now

    def advance(self, seconds: float) -> None:
        if seconds < 0:
            raise ValueError("clock never goes backwards")
        with self._lock:
            self._now += seconds
