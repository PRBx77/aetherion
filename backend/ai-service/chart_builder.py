"""
Genera configuraciones Chart.js según el tipo de datos que solicita el usuario.
Detecta automáticamente qué gráfica dibujar según los datos live disponibles.
"""

CHART_COLORS = {
    "cyan": "#06B6D4",
    "gold": "#F59E0B",
    "violet": "#A78BFA",
    "green": "#10B981",
    "red": "#EF4444",
    "gray": "#64748B"
}


def build_chart(query: str, live_data: dict) -> dict | None:
    """Devuelve config Chart.js o None si no aplica."""
    q = query.lower()

    # 1. Comparativa precios top cryptos
    if any(k in q for k in ["precio", "price", "comparar", "compara", "top", "ranking"]):
        if "top_cryptos" in live_data:
            return _chart_top_prices(live_data["top_cryptos"])

    # 2. Cambios 24h
    if any(k in q for k in ["24h", "cambio", "change", "sube", "baja", "rojo", "verde"]):
        if "top_cryptos" in live_data:
            return _chart_24h_changes(live_data["top_cryptos"])

    # 3. Volúmenes
    if any(k in q for k in ["volumen", "volume", "trading"]):
        if "top_cryptos" in live_data:
            return _chart_volumes(live_data["top_cryptos"])

    # 4. Distribución supply DWALL
    if any(k in q for k in ["supply", "distribuci", "distribution", "tokenomics", "reparto"]):
        return _chart_dwall_distribution()

    # 5. Progreso airdrop
    if any(k in q for k in ["airdrop", "claim", "wallets", "progreso", "progress"]):
        if "airdrop" in live_data and "error" not in live_data["airdrop"]:
            return _chart_airdrop_progress(live_data["airdrop"])

    # 6. Dominance BTC/ETH
    if any(k in q for k in ["dominance", "dominancia", "cuota"]):
        if "market_summary" in live_data:
            return _chart_market_dominance(live_data["market_summary"])

    return None


def _chart_top_prices(cryptos: list) -> dict:
    labels = [c["symbol"] for c in cryptos if "error" not in c]
    prices = [c["price_usd"] for c in cryptos if "error" not in c]
    return {
        "type": "bar",
        "title": "Top Cryptos — Price (USD)",
        "config": {
            "type": "bar",
            "data": {
                "labels": labels,
                "datasets": [{
                    "label": "Price USD",
                    "data": prices,
                    "backgroundColor": CHART_COLORS["cyan"],
                    "borderColor": CHART_COLORS["gold"],
                    "borderWidth": 1
                }]
            },
            "options": _dark_options("USD ($)", log_scale=True)
        }
    }


def _chart_24h_changes(cryptos: list) -> dict:
    filtered = [c for c in cryptos if "error" not in c]
    labels = [c["symbol"] for c in filtered]
    changes = [c["change_24h_percent"] for c in filtered]
    colors = [CHART_COLORS["green"] if x >= 0 else CHART_COLORS["red"] for x in changes]
    return {
        "type": "bar",
        "title": "24h Change (%)",
        "config": {
            "type": "bar",
            "data": {
                "labels": labels,
                "datasets": [{
                    "label": "24h %",
                    "data": changes,
                    "backgroundColor": colors,
                    "borderColor": colors,
                    "borderWidth": 1
                }]
            },
            "options": _dark_options("Change (%)")
        }
    }


def _chart_volumes(cryptos: list) -> dict:
    filtered = [c for c in cryptos if "error" not in c]
    labels = [c["symbol"] for c in filtered]
    volumes = [round(c["volume_24h_usd"] / 1e9, 2) for c in filtered]
    return {
        "type": "bar",
        "title": "24h Volume (USD Billions)",
        "config": {
            "type": "bar",
            "data": {
                "labels": labels,
                "datasets": [{
                    "label": "Volume ($B)",
                    "data": volumes,
                    "backgroundColor": CHART_COLORS["violet"],
                    "borderColor": CHART_COLORS["gold"],
                    "borderWidth": 1
                }]
            },
            "options": _dark_options("Billions USD")
        }
    }


def _chart_dwall_distribution() -> dict:
    return {
        "type": "doughnut",
        "title": "DWALL Supply Distribution (1B total)",
        "config": {
            "type": "doughnut",
            "data": {
                "labels": ["Presale (70%)", "Airdrop (15%)", "Marketing (10%)", "Dev (5%)"],
                "datasets": [{
                    "data": [700, 150, 100, 50],
                    "backgroundColor": [
                        CHART_COLORS["cyan"], CHART_COLORS["gold"],
                        CHART_COLORS["violet"], CHART_COLORS["green"]
                    ],
                    "borderColor": "#0F172A",
                    "borderWidth": 2
                }]
            },
            "options": _dark_options(None, is_pie=True)
        }
    }


def _chart_airdrop_progress(airdrop: dict) -> dict:
    claimed = airdrop.get("claims_completed", 0)
    remaining = airdrop.get("remaining_slots", 250)
    return {
        "type": "doughnut",
        "title": f"Airdrop Progress: {claimed}/250 wallets",
        "config": {
            "type": "doughnut",
            "data": {
                "labels": [f"Claimed ({claimed})", f"Remaining ({remaining})"],
                "datasets": [{
                    "data": [claimed, remaining],
                    "backgroundColor": [CHART_COLORS["gold"], CHART_COLORS["gray"]],
                    "borderColor": "#0F172A",
                    "borderWidth": 2
                }]
            },
            "options": _dark_options(None, is_pie=True)
        }
    }


def _chart_market_dominance(m: dict) -> dict:
    btc = m.get("btc_dominance_percent", 0)
    eth = m.get("eth_dominance_percent", 0)
    other = 100 - btc - eth
    return {
        "type": "doughnut",
        "title": "Market Dominance",
        "config": {
            "type": "doughnut",
            "data": {
                "labels": [f"BTC ({btc}%)", f"ETH ({eth}%)", f"Other ({round(other, 2)}%)"],
                "datasets": [{
                    "data": [btc, eth, other],
                    "backgroundColor": [CHART_COLORS["gold"], CHART_COLORS["cyan"], CHART_COLORS["violet"]],
                    "borderColor": "#0F172A",
                    "borderWidth": 2
                }]
            },
            "options": _dark_options(None, is_pie=True)
        }
    }


def _dark_options(y_label: str = None, log_scale: bool = False, is_pie: bool = False) -> dict:
    """Estilo dark coherente brand."""
    if is_pie:
        return {
            "responsive": True,
            "maintainAspectRatio": False,
            "plugins": {
                "legend": {"labels": {"color": "#E2E8F0", "font": {"size": 11}}},
                "tooltip": {"backgroundColor": "#0F172A"}
            }
        }
    opts = {
        "responsive": True,
        "maintainAspectRatio": False,
        "scales": {
            "x": {
                "ticks": {"color": "#94A3B8"},
                "grid": {"color": "rgba(148,163,184,0.1)"}
            },
            "y": {
                "ticks": {"color": "#94A3B8"},
                "grid": {"color": "rgba(148,163,184,0.1)"},
                "type": "logarithmic" if log_scale else "linear"
            }
        },
        "plugins": {
            "legend": {"labels": {"color": "#E2E8F0"}},
            "tooltip": {"backgroundColor": "#0F172A"}
        }
    }
    if y_label:
        opts["scales"]["y"]["title"] = {"display": True, "text": y_label, "color": "#94A3B8"}
    return opts
