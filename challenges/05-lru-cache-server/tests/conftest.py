import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "support"))
if os.environ.get("SDC_SOLUTION"):
    sys.path.insert(0, os.environ["SDC_SOLUTION"])

import pytest
from cachec import Server, kill_all


@pytest.fixture
def start(tmp_path):
    def make(max_bytes=16 << 20):
        return Server(tmp_path, max_bytes)
    yield make
    kill_all()
