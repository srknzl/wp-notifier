from kvh import Kv, tear, value


def test_correctness_put_get_delete(tmp_path):
    kv = Kv(tmp_path / "d")
    try:
        assert kv.get("a") is None
        kv.put("a", "1")
        kv.put("a", "2")
        assert kv.get("a") == "2"
        kv.delete("a")
        assert kv.get("a") is None
        kv.delete("never")
    finally:
        kv.close()


def test_correctness_pipelined_responses_in_order(tmp_path):
    kv = Kv(tmp_path / "d")
    try:
        cmds = []
        for i in range(200):
            cmds += [f"PUT k{i} {value('k', i)}", f"GET k{i}"]
        res = kv.batch(cmds)
        for i in range(200):
            assert res[2 * i] == "OK"
            assert res[2 * i + 1] == "VALUE " + value("k", i)
    finally:
        kv.close()


def test_correctness_clean_restart(tmp_path):
    d = tmp_path / "d"
    kv = Kv(d)
    kv.put("x", "hello")
    kv.close()
    kv = Kv(d)
    try:
        assert kv.get("x") == "hello"
    finally:
        kv.close()


def test_durability_kill_after_ack(tmp_path):
    d = tmp_path / "d"
    kv = Kv(d)
    for i in range(50):
        kv.put(f"k{i}", value("k", i))
    kv.kill()
    kv = Kv(d)
    try:
        for i in range(50):
            assert kv.get(f"k{i}") == value("k", i)
    finally:
        kv.close()


def test_durability_torn_tail(tmp_path):
    d = tmp_path / "d"
    kv = Kv(d)
    kv.put("a", "1")
    kv.kill()
    tear(d, b"\x07garbage\xff")
    kv = Kv(d)
    try:
        assert kv.get("a") == "1"
        kv.put("b", "2")
        assert kv.get("b") == "2"
    finally:
        kv.close()
