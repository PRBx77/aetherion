"""
Sistema free trial: 3 consultas gratis por IP.
Después requiere pago via wallet.
"""
import time
from threading import Lock

FREE_LIMIT = 3
RESET_HOURS = 24  # Reset counter cada 24h

_ip_counter = {}  # {ip: {"count": int, "first_at": timestamp}}
_lock = Lock()


def check_free_quota(ip: str) -> dict:
    """
    Devuelve estado del free trial para esta IP.
    """
    now = time.time()
    with _lock:
        entry = _ip_counter.get(ip)

        # Reset si pasaron 24h
        if entry and (now - entry["first_at"]) > RESET_HOURS * 3600:
            entry = None

        if not entry:
            return {
                "used": 0,
                "remaining": FREE_LIMIT,
                "limit": FREE_LIMIT,
                "requires_payment": False,
                "warning": None
            }

        used = entry["count"]
        remaining = max(0, FREE_LIMIT - used)
        requires_payment = used >= FREE_LIMIT

        warning = None
        if remaining == 2:
            warning = "second_to_last"
        elif remaining == 1:
            warning = "last"

        return {
            "used": used,
            "remaining": remaining,
            "limit": FREE_LIMIT,
            "requires_payment": requires_payment,
            "warning": warning
        }


def consume_free(ip: str) -> dict:
    """Consume una consulta gratuita. Devuelve el estado post-consumo."""
    now = time.time()
    with _lock:
        entry = _ip_counter.get(ip)

        if entry and (now - entry["first_at"]) > RESET_HOURS * 3600:
            entry = None

        if not entry:
            _ip_counter[ip] = {"count": 1, "first_at": now}
        else:
            entry["count"] += 1
            _ip_counter[ip] = entry

    return check_free_quota(ip)


def stats() -> dict:
    with _lock:
        return {
            "total_ips": len(_ip_counter),
            "ips": {ip: {"used": e["count"]} for ip, e in _ip_counter.items()}
        }


def reset_ip(ip: str):
    """Solo para admin/debug."""
    with _lock:
        _ip_counter.pop(ip, None)
