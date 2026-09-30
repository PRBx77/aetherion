"""Datos de mercado crypto vía CoinGecko API pública."""
import httpx
import cache_manager

COINGECKO = "https://api.coingecko.com/api/v3"

# Top cryptos con symbols CoinGecko
TOP_COINS = {
    "bitcoin": "BTC",
    "ethereum": "ETH",
    "binancecoin": "BNB",
    "solana": "SOL",
    "ripple": "XRP",
    "cardano": "ADA",
    "dogecoin": "DOGE"
}


async def get_bnb_price() -> dict:
    cached = cache_manager.get("bnb_price")
    if cached: return cached
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                f"{COINGECKO}/simple/price",
                params={"ids": "binancecoin", "vs_currencies": "usd,eur", "include_24hr_change": "true"}
            )
            data = r.json()["binancecoin"]
            result = {
                "usd": data["usd"],
                "eur": data["eur"],
                "change_24h_percent": round(data.get("usd_24h_change", 0), 2)
            }
            cache_manager.set("bnb_price", result, ttl=30)
            return result
    except Exception as e:
        return {"error": str(e)}


async def get_top_cryptos() -> list:
    """Top 7 cryptos con precio, cambio 24h, volumen 24h."""
    cached = cache_manager.get("top_cryptos")
    if cached: return cached
    try:
        ids = ",".join(TOP_COINS.keys())
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{COINGECKO}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "ids": ids,
                    "order": "market_cap_desc",
                    "per_page": 10,
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "24h"
                }
            )
            data = r.json()
            result = []
            for coin in data:
                result.append({
                    "symbol": coin["symbol"].upper(),
                    "name": coin["name"],
                    "price_usd": coin["current_price"],
                    "change_24h_percent": round(coin.get("price_change_percentage_24h", 0), 2),
                    "volume_24h_usd": coin.get("total_volume", 0),
                    "market_cap_usd": coin.get("market_cap", 0),
                    "market_cap_rank": coin.get("market_cap_rank", 0)
                })
            cache_manager.set("top_cryptos", result, ttl=30)
            return result
    except Exception as e:
        return [{"error": str(e)}]


async def get_market_summary() -> dict:
    """Resumen global market: total cap, dominance BTC/ETH, Fear&Greed."""
    cached = cache_manager.get("market_summary")
    if cached: return cached
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{COINGECKO}/global")
            g = r.json()["data"]
            result = {
                "total_market_cap_usd": g["total_market_cap"]["usd"],
                "total_volume_24h_usd": g["total_volume"]["usd"],
                "btc_dominance_percent": round(g["market_cap_percentage"]["btc"], 2),
                "eth_dominance_percent": round(g["market_cap_percentage"]["eth"], 2),
                "market_cap_change_24h_percent": round(g.get("market_cap_change_percentage_24h_usd", 0), 2),
                "active_cryptocurrencies": g.get("active_cryptocurrencies", 0)
            }
            cache_manager.set("market_summary", result, ttl=60)
            return result
    except Exception as e:
        return {"error": str(e)}
