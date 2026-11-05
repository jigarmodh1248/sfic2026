"""In-memory refresh-token revocation registry (logout).

MVP note: this lives in process memory — sufficient for single-worker deploys.
For multi-worker/multi-host deployments move to Postgres/Redis (phase-2 hardening).
"""
import time
import threading

_revoked: dict[str, float] = {}  # jti -> exp epoch
_lock = threading.Lock()


def revoke(jti: str, expires_at: float) -> None:
    with _lock:
        _revoked[jti] = expires_at
        _cleanup_locked()


def is_revoked(jti: str) -> bool:
    with _lock:
        _cleanup_locked()
        return jti in _revoked


def _cleanup_locked() -> None:
    now = time.time()
    for jti in [j for j, exp in _revoked.items() if exp <= now]:
        del _revoked[jti]
