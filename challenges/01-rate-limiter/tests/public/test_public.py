import pytest
from sdc_rl import Decision, FakeClock, SharedStore, UnknownTenant

from limiter import RateLimiter


def make(rate=2.0, burst=5, fail_mode="closed"):
    clock = FakeClock()
    store = SharedStore(clock)
    rl = RateLimiter(store, clock)
    rl.configure("acme", rate, burst, fail_mode)
    return rl, clock, store


def test_correctness_burst_then_deny():
    rl, _, _ = make()
    got = [rl.acquire("acme", "u1").allowed for _ in range(6)]
    assert got == [True] * 5 + [False]


def test_correctness_returns_decision():
    rl, _, _ = make()
    d = rl.acquire("acme", "u1")
    assert isinstance(d, Decision)
    assert d == Decision(True, 4, 0)


def test_correctness_refill_over_time():
    rl, clock, _ = make(rate=2.0, burst=2)
    assert rl.acquire("acme", "k").allowed
    assert rl.acquire("acme", "k").allowed
    assert not rl.acquire("acme", "k").allowed
    clock.advance(0.5)
    assert rl.acquire("acme", "k").allowed


def test_correctness_unknown_tenant():
    rl, _, _ = make()
    with pytest.raises(UnknownTenant):
        rl.acquire("nobody", "k")


def test_reliability_dead_store_fail_closed():
    rl, _, store = make()
    store.down = True
    d = rl.acquire("acme", "k")
    assert d.allowed is False
