import time

from proxyc import parallel


def test_correctness_passthrough(proxy, backend):
    backend.rule("/doc", body='{"a": 1}', ctype="application/json")
    p = proxy()
    r = p.get("/doc")
    assert r.status == 200 and r.body == b'{"a": 1}'
    assert r.headers["content-type"].startswith("application/json")
    assert r.cache == "MISS"


def test_correctness_cache_hit(proxy, backend):
    p = proxy(ttl_ms=2000)
    a = p.get("/item?id=1")
    b = p.get("/item?id=1")
    assert a.body == b.body and b.cache == "HIT"
    assert backend.count("/item?id=1") == 1


def test_coalescing_one_backend_call(proxy, backend):
    backend.rule("/slow", delay=0.4)
    p = proxy()
    res = parallel(50, lambda i: p.get("/slow"))
    assert all(r.status == 200 for r in res)
    assert len({r.body for r in res}) == 1
    assert backend.count("/slow") == 1


def test_resilience_timeout(proxy, backend):
    backend.rule("/hang", delay=3)
    p = proxy(timeout_ms=300)
    t0 = time.time()
    r = p.get("/hang")
    assert r.status == 504
    assert time.time() - t0 < 1.5


def test_scalability_cached_throughput(proxy, backend):
    p = proxy(ttl_ms=30000)
    for i in range(20):
        p.get(f"/k{i}")

    def work(w):
        for j in range(100):
            assert p.get(f"/k{(w + j) % 20}").status == 200

    t0 = time.time()
    parallel(8, work)
    assert time.time() - t0 < 10
    assert backend.count() == 20
