import hashlib
import hmac
import io
import os
import zipfile
from pathlib import Path

MAGIC = b"SDCVAULT1"


class VaultError(Exception):
    pass


def _key(challenge_id: str) -> bytes:
    return hashlib.sha256(b"sdc-vault-v1:" + challenge_id.encode()).digest()


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        out += hashlib.sha256(key + nonce + counter.to_bytes(8, "big")).digest()
        counter += 1
    return bytes(out[:length])


def _xor(data: bytes, stream: bytes) -> bytes:
    n = len(data)
    return (int.from_bytes(data, "big") ^ int.from_bytes(stream, "big")).to_bytes(n, "big") if n else b""


def seal(challenge_id: str, src_dir: Path, out_file: Path) -> int:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(src_dir.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                zf.write(path, path.relative_to(src_dir).as_posix())
    plain = buf.getvalue()
    key = _key(challenge_id)
    nonce = os.urandom(16)
    body = _xor(plain, _keystream(key, nonce, len(plain)))
    tag = hmac.new(key, MAGIC + nonce + body, hashlib.sha256).digest()
    out_file.write_bytes(MAGIC + nonce + tag + body)
    return len(plain)


def open_vault(challenge_id: str, vault_file: Path) -> zipfile.ZipFile:
    raw = vault_file.read_bytes()
    if not raw.startswith(MAGIC):
        raise VaultError(f"{vault_file} is not a vault")
    nonce = raw[len(MAGIC):len(MAGIC) + 16]
    tag = raw[len(MAGIC) + 16:len(MAGIC) + 48]
    body = raw[len(MAGIC) + 48:]
    key = _key(challenge_id)
    if not hmac.compare_digest(tag, hmac.new(key, MAGIC + nonce + body, hashlib.sha256).digest()):
        raise VaultError(f"{vault_file} failed integrity check")
    return zipfile.ZipFile(io.BytesIO(_xor(body, _keystream(key, nonce, len(body)))))


def extract(challenge_id: str, vault_file: Path, dest: Path, prefix: str = "") -> list[str]:
    names = []
    with open_vault(challenge_id, vault_file) as zf:
        for name in zf.namelist():
            if name.startswith(prefix):
                rel = name[len(prefix):]
                target = dest / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zf.read(name))
                names.append(rel)
    return names
