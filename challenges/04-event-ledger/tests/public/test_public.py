from concurrent.futures import ThreadPoolExecutor

from ledger import Ledger, replay


def test_correctness_accounts_and_deposit(tmp_path):
    L = Ledger(tmp_path / "d")
    try:
        assert L.create("alice") == (201, {"account": "alice", "balance": 0})
        assert L.create("alice") == (409, {"error": "exists"})
        assert L.req("GET", "/accounts/bob")[0] == 404
        status, body = L.deposit("alice", 50, "k1")
        assert status == 200 and body["tx"] == 2
        assert L.balance("alice") == 50
    finally:
        L.close()


def test_correctness_transfer_and_events(tmp_path):
    L = Ledger(tmp_path / "d")
    try:
        L.create("a")
        L.create("b")
        L.deposit("a", 10, "d1")
        assert L.transfer("a", "b", 4, "t1") == (200, {"tx": 4})
        assert L.transfer("a", "b", 7, "t2") == (409, {"error": "insufficient_funds"})
        ev = L.events()
        assert [e["type"] for e in ev] == ["account_created", "account_created", "deposit", "transfer"]
        assert ev[3] == {"seq": 4, "type": "transfer", "from": "a", "to": "b", "amount": 4, "key": "t1"}
        assert replay(ev) == {"a": 6, "b": 4}
    finally:
        L.close()


def test_correctness_idempotent_retry(tmp_path):
    L = Ledger(tmp_path / "d")
    try:
        L.create("a")
        first = L.deposit("a", 5, "same")
        assert L.deposit("a", 5, "same") == first
        assert L.deposit("a", 6, "same") == (422, {"error": "key_reused"})
        assert L.balance("a") == 5
    finally:
        L.close()


def test_concurrency_no_double_spend(tmp_path):
    L = Ledger(tmp_path / "d")
    try:
        for a in ("src", "dst"):
            L.create(a)
        L.deposit("src", 20, "seed")
        with ThreadPoolExecutor(32) as ex:
            res = list(ex.map(lambda i: L.transfer("src", "dst", 1, f"t{i}")[0], range(60)))
        assert res.count(200) == 20 and res.count(409) == 40
        assert L.balance("src") == 0
    finally:
        L.close()


def test_durability_survives_kill(tmp_path):
    L = Ledger(tmp_path / "d")
    L.create("a")
    for i in range(20):
        L.deposit("a", 1, f"k{i}")
    before = L.events()
    L.kill()
    L = Ledger(tmp_path / "d")
    try:
        assert L.events() == before
        assert L.balance("a") == 20
    finally:
        L.close()
