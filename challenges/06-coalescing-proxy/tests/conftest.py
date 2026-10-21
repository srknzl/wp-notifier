import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "support"))
if os.environ.get("SDC_SOLUTION"):
    sys.path.insert(0, os.environ["SDC_SOLUTION"])

import pytest
from proxyc import Backend, Proxy, kill_all


@pytest.fixture
def backend():
    b = Backend()
    yield b
    kill_all()


@pytest.fixture
def proxy(tmp_path, backend):
    def make(**kw):
        return Proxy(tmp_path, backend, **kw)
    yield make
    kill_all()
