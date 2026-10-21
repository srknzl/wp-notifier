import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "support"))
if os.environ.get("SDC_SOLUTION"):
    sys.path.insert(0, os.environ["SDC_SOLUTION"])

import pytest
from ledger import kill_all


@pytest.fixture(autouse=True)
def _stop_servers():
    yield
    kill_all()
