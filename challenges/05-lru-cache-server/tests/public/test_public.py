import time

from cachec import cost


def test_correctness_set_get_del(start):
    s = start()
    c = s.client()
    assert c.call("GET a") == "MISS"
    assert c.call("SET a 0 hello world") == "OK"
    assert c.call("GET a") == "VALUE hello world"
    assert c.call("DEL a") == "DELETED"
    assert c.call("DEL a") == "MISS"
    assert c.call("BOGUS").startswith("ERR")


def test_correctness_incr(start):
    c = start().client()
    assert c.call("INCR n") == "VALUE 1"
    assert c.call("INCR n") == "VALUE 2"
    c.call("SET s 0 abc")
    assert c.call("INCR s") == "ERR not_integer"


def test_correctness_ttl(start):
    c = start().client()
    c.call("SET t 150 v")
    assert c.call("GET t") == "VALUE v"
    time.sleep(0.4)
    assert c.call("GET t") == "MISS"


def test_memory_lru_eviction(start):
    value = "x" * 1000
    per = cost("k00", value)
    s = start(max_bytes=per * 10)
    c = s.client()
    for i in range(10):
        assert c.call(f"SET k{i:02d} 0 {value}") == "OK"
    assert c.call("GET k00").startswith("VALUE")
    c.call(f"SET k10 0 {value}")
    assert c.call("GET k00").startswith("VALUE")
    assert c.call("GET k01") == "MISS"
    st = s.stats()
    assert st["bytes"] <= per * 10 and st["evictions"] == 1


def test_scalability_pipelined(start):
    s = start()
    c = s.client()
    t0 = time.time()
    res = c.batch([f"SET k{i} 0 v{i}" for i in range(20000)] + [f"GET k{i}" for i in range(20000)])
    assert res[:20000] == ["OK"] * 20000
    assert res[20000:] == [f"VALUE v{i}" for i in range(20000)]
    assert time.time() - t0 < 20
