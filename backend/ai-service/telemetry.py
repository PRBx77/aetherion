"""
Telemetría de interacciones para el modo BETA.
Almacena en SQLite local para análisis posterior.
"""
import sqlite3
import hashlib
import time
import json
import os
from pathlib import Path
from threading import Lock

DB_PATH = Path("/mnt/data/CROTALUS_INVEST/aetherion/backend/ai-service/telemetry.db")
_lock = Lock()

# BETA MODE toggle (env var o default true durante beta)
BETA_MODE = os.getenv("AETHERION_BETA_MODE", "true").lower() == "true"


def _init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                ip_hash TEXT NOT NULL,
                lang TEXT,
                message TEXT,
                response TEXT,
                processing_ms INTEGER,
                had_chart BOOLEAN DEFAULT 0,
                data_categories TEXT,
                feedback INTEGER DEFAULT NULL,
                feedback_at REAL DEFAULT NULL,
                error TEXT DEFAULT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_time ON interactions(timestamp);
            CREATE INDEX IF NOT EXISTS idx_iphash ON interactions(ip_hash);
            CREATE INDEX IF NOT EXISTS idx_feedback ON interactions(feedback);

            CREATE TABLE IF NOT EXISTS unique_visitors (
                ip_hash TEXT PRIMARY KEY,
                first_seen REAL,
                last_seen REAL,
                total_interactions INTEGER DEFAULT 0
            );
        """)


_init_db()


def _hash_ip(ip: str) -> str:
    """Anonymize IP with salt."""
    salt = "aetherion_beta_2027"
    return hashlib.sha256(f"{ip}{salt}".encode()).hexdigest()[:16]


def log_interaction(
    ip: str,
    lang: str,
    message: str,
    response: str,
    processing_ms: int,
    had_chart: bool = False,
    data_categories: dict = None,
    error: str = None
) -> int:
    """Registra una interacción. Devuelve el ID para posible feedback."""
    if not BETA_MODE:
        return -1

    ip_hash = _hash_ip(ip)
    now = time.time()

    with _lock:
        with sqlite3.connect(DB_PATH) as db:
            cur = db.execute("""
                INSERT INTO interactions
                (timestamp, ip_hash, lang, message, response, processing_ms, had_chart, data_categories, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                now, ip_hash, lang, message[:500], response[:2000],
                processing_ms, had_chart,
                json.dumps(data_categories) if data_categories else None,
                error
            ))
            interaction_id = cur.lastrowid

            # Update unique visitors
            db.execute("""
                INSERT INTO unique_visitors (ip_hash, first_seen, last_seen, total_interactions)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(ip_hash) DO UPDATE SET
                    last_seen = excluded.last_seen,
                    total_interactions = total_interactions + 1
            """, (ip_hash, now, now))

            return interaction_id


def record_feedback(interaction_id: int, feedback: int) -> bool:
    """feedback: 1 = útil, -1 = no útil."""
    if feedback not in (1, -1): return False
    with _lock:
        with sqlite3.connect(DB_PATH) as db:
            db.execute("""
                UPDATE interactions SET feedback = ?, feedback_at = ?
                WHERE id = ?
            """, (feedback, time.time(), interaction_id))
    return True


def get_stats() -> dict:
    """Dashboard admin stats."""
    with _lock:
        with sqlite3.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row

            total = db.execute("SELECT COUNT(*) as c FROM interactions").fetchone()["c"]
            visitors = db.execute("SELECT COUNT(*) as c FROM unique_visitors").fetchone()["c"]

            langs = db.execute("""
                SELECT lang, COUNT(*) as c FROM interactions
                GROUP BY lang ORDER BY c DESC
            """).fetchall()

            avg_latency = db.execute("""
                SELECT AVG(processing_ms) as avg_ms FROM interactions WHERE error IS NULL
            """).fetchone()["avg_ms"]

            feedback_stats = db.execute("""
                SELECT
                    SUM(CASE WHEN feedback = 1 THEN 1 ELSE 0 END) as positive,
                    SUM(CASE WHEN feedback = -1 THEN 1 ELSE 0 END) as negative,
                    SUM(CASE WHEN feedback IS NULL THEN 1 ELSE 0 END) as no_feedback
                FROM interactions
            """).fetchone()

            top_topics = db.execute("""
                SELECT
                    CASE
                        WHEN LOWER(message) LIKE '%precio%' OR LOWER(message) LIKE '%price%' THEN 'price/market'
                        WHEN LOWER(message) LIKE '%airdrop%' OR LOWER(message) LIKE '%claim%' THEN 'airdrop'
                        WHEN LOWER(message) LIKE '%dwall%' OR LOWER(message) LIKE '%diamond%' THEN 'dwall'
                        WHEN LOWER(message) LIKE '%venus%' OR LOWER(message) LIKE '%yield%' THEN 'venus/yield'
                        WHEN LOWER(message) LIKE '%hora%' OR LOWER(message) LIKE '%time%' THEN 'time'
                        WHEN LOWER(message) LIKE '%hola%' OR LOWER(message) LIKE '%hello%' OR LOWER(message) LIKE '%hi%' THEN 'greeting'
                        ELSE 'other'
                    END as topic,
                    COUNT(*) as c
                FROM interactions
                GROUP BY topic
                ORDER BY c DESC
            """).fetchall()

            errors = db.execute("""
                SELECT COUNT(*) as c FROM interactions WHERE error IS NOT NULL
            """).fetchone()["c"]

            last_24h = db.execute("""
                SELECT COUNT(*) as c FROM interactions
                WHERE timestamp > ?
            """, (time.time() - 86400,)).fetchone()["c"]

            top_negative = db.execute("""
                SELECT message, response FROM interactions
                WHERE feedback = -1
                ORDER BY timestamp DESC LIMIT 10
            """).fetchall()

            return {
                "beta_mode": BETA_MODE,
                "total_interactions": total,
                "unique_visitors": visitors,
                "interactions_24h": last_24h,
                "avg_latency_ms": round(avg_latency, 0) if avg_latency else 0,
                "languages": [dict(r) for r in langs],
                "feedback": dict(feedback_stats),
                "top_topics": [dict(r) for r in top_topics],
                "errors_count": errors,
                "recent_negative_feedback": [dict(r) for r in top_negative]
            }


def get_recent_bad(limit: int = 20) -> list:
    """Últimas respuestas con feedback negativo para revisión."""
    with _lock:
        with sqlite3.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row
            rows = db.execute("""
                SELECT id, timestamp, lang, message, response, processing_ms
                FROM interactions
                WHERE feedback = -1
                ORDER BY timestamp DESC LIMIT ?
            """, (limit,)).fetchall()
            return [dict(r) for r in rows]
