from jobqueue import JobQueue
from sdc_jq import FakeClock


def test_correctness_fifo_within_tenant():
    q = JobQueue(FakeClock())
    ids = [q.enqueue("t", i) for i in range(3)]
    assert [q.claim("w").job_id for _ in range(3)] == ids
    assert q.claim("w") is None


def test_correctness_idempotent_enqueue():
    q = JobQueue(FakeClock())
    a = q.enqueue("t", "x", key="k")
    assert q.enqueue("t", "x", key="k") == a
    assert q.stats()["ready"] == 1


def test_correctness_round_robin():
    q = JobQueue(FakeClock())
    for i in range(5):
        q.enqueue("A", i)
    q.enqueue("B", 0)
    assert sorted(q.claim("w").tenant for _ in range(2)) == ["A", "B"]


def test_reliability_visibility_timeout_and_fencing():
    clock = FakeClock()
    q = JobQueue(clock, visibility_timeout=10)
    q.enqueue("t", "p")
    old = q.claim("w1")
    assert q.claim("w2") is None
    clock.advance(10)
    new = q.claim("w2")
    assert new.attempt == 2
    assert not q.ack(old)
    assert q.ack(new)


def test_reliability_dead_letter_after_max_attempts():
    clock = FakeClock()
    q = JobQueue(clock, max_attempts=2, backoff_base=1)
    q.enqueue("t", "p")
    q.nack(q.claim("w"), "a")
    clock.advance(1)
    q.nack(q.claim("w"), "b")
    assert [d.error for d in q.dead_letters("t")] == ["b"]
