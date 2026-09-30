"""Cache simple TTL 30 segundos."""
import time
from threading import Lock

_cache = {}
_lock = Lock()
TTL_DEFAULT = 30  # segundos

def get(key: str):
    with _lock:
        entry = _cache.get(key)
        if not entry: return None
        value, expiry = entry
        if time.time() > expiry:
            del _cache[key]
            return None
        return value

def set(key: str, value, ttl: int = TTL_DEFAULT):
    with _lock:
        _cache[key] = (value, time.time() + ttl)

def stats():
    with _lock:
        return {"entries": len(_cache), "keys": list(_cache.keys())}
