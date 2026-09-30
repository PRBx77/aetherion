"""Clasifica la query para decidir qué datos on-chain/market fetchar."""
import re

KEYWORDS_DWALL = ["dwall", "diamondwall", "diamond wall", "token", "supply", "holder", "wallet", "contrato", "contract"]
KEYWORDS_PRESALE = ["presale", "preventa", "airdrop", "claim", "reclamar", "onboarding", "250"]
KEYWORDS_VENUS = ["venus", "yield", "rendimiento", "apy", "apr", "lending", "prestamo", "tesorer", "treasury", "bnb en venus"]
KEYWORDS_MARKET = ["btc", "bitcoin", "eth", "ethereum", "bnb", "sol", "solana", "xrp", "ada", "doge",
                   "precio", "price", "mercado", "market", "volumen", "volume", "cap", "dominancia",
                   "dominance", "cripto", "crypto"]

def classify(text: str) -> dict:
    t = text.lower()
    return {
        "needs_dwall": any(k in t for k in KEYWORDS_DWALL),
        "needs_presale_airdrop": any(k in t for k in KEYWORDS_PRESALE),
        "needs_venus": any(k in t for k in KEYWORDS_VENUS),
        "needs_market": any(k in t for k in KEYWORDS_MARKET),
        "needs_all_default": len(t.split()) < 4  # short greetings → include summary
    }
