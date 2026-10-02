"""Lector de datos on-chain DWALL usando web3.py + BscScan."""
import os
import httpx
from web3 import Web3
from dotenv import load_dotenv
import cache_manager

load_dotenv()

RPC = "https://bsc-dataseed.binance.org/"
BSCSCAN_API = "https://api.bscscan.com/api"
BSCSCAN_KEY = os.getenv("BSCSCAN_API_KEY", "X1K9IV47VJ8VGNP2FW81EJ53QUIV5Q5V6I")

# DiamondWall contracts (mainnet)
DWALL_TOKEN = "0xd8Dbf478436A5770A274658ab424c66139142839"
TREASURY = "0x6905537228B3629E6d17721e86c3c8B3117c445f"
PRESALE = "0xCB89f1A766dEe92A5D512aD842e5CEC361f157EA"
AIRDROP = "0xe18D2605bb2AEf257173AA0CcD60Bec036579F74"
VENUS_BNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36"

ERC20_ABI = [
    {"inputs":[],"name":"totalSupply","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"type":"address"}],"name":"balanceOf","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}
]

VENUS_ABI = [
    {"inputs":[],"name":"supplyRatePerBlock","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"exchangeRateStored","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"type":"address"}],"name":"balanceOf","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}
]

def _w3():
    return Web3(Web3.HTTPProvider(RPC))


async def get_dwall_stats() -> dict:
    """Supply, holders, TVL treasury."""
    cached = cache_manager.get("dwall_stats")
    if cached: return cached

    try:
        w3 = _w3()
        token = w3.eth.contract(address=DWALL_TOKEN, abi=ERC20_ABI)
        supply = token.functions.totalSupply().call()
        treasury_bal = token.functions.balanceOf(TREASURY).call()
        presale_bal = token.functions.balanceOf(PRESALE).call()

        # Treasury BNB
        treasury_bnb = w3.eth.get_balance(TREASURY)
        presale_bnb = w3.eth.get_balance(PRESALE)

        result = {
            "total_supply": float(w3.from_wei(supply, "ether")),
            "treasury_dwall": float(w3.from_wei(treasury_bal, "ether")),
            "presale_dwall_remaining": float(w3.from_wei(presale_bal, "ether")),
            "treasury_bnb": float(w3.from_wei(treasury_bnb, "ether")),
            "presale_bnb_collected": float(w3.from_wei(presale_bnb, "ether"))
        }
        cache_manager.set("dwall_stats", result, ttl=120)
        return result
    except Exception as e:
        return {"error": str(e)}


async def get_dwall_holders() -> int:
    """Holder count via BscScan API."""
    cached = cache_manager.get("dwall_holders")
    if cached is not None: return cached

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{BSCSCAN_API}",
                params={
                    "module": "token",
                    "action": "tokenholderlist",
                    "contractaddress": DWALL_TOKEN,
                    "page": 1, "offset": 1,
                    "apikey": BSCSCAN_KEY
                }
            )
            data = r.json()
            # Fallback: tokeninfo
            r2 = await client.get(
                f"{BSCSCAN_API}",
                params={
                    "module": "token",
                    "action": "tokeninfo",
                    "contractaddress": DWALL_TOKEN,
                    "apikey": BSCSCAN_KEY
                }
            )
            info = r2.json()
            if info.get("result") and isinstance(info["result"], list):
                holders = int(info["result"][0].get("holders", 0))
                cache_manager.set("dwall_holders", holders, ttl=60)
                return holders
    except Exception as e:
        print(f"[holders] {e}")
    return 0


async def get_venus_stats() -> dict:
    """Venus Protocol supply rate + Treasury's vBNB balance."""
    cached = cache_manager.get("venus_stats")
    if cached: return cached

    try:
        w3 = _w3()
        venus = w3.eth.contract(address=VENUS_BNB, abi=VENUS_ABI)
        supply_rate = venus.functions.supplyRatePerBlock().call()
        exchange_rate = venus.functions.exchangeRateStored().call()
        treasury_vbnb = venus.functions.balanceOf(TREASURY).call()

        # APY calculation: (1 + supply_rate * blocks_per_day)^365 - 1
        blocks_per_day = 28800  # BSC ~3s blocks
        rate_per_block = supply_rate / 1e18
        apy = ((1 + rate_per_block * blocks_per_day) ** 365 - 1) * 100

        # Treasury BNB equivalent in Venus
        treasury_bnb_in_venus = (treasury_vbnb * exchange_rate) / (1e18 * 1e18)

        result = {
            "supply_apy_percent": round(apy, 2),
            "treasury_vbnb_balance": float(treasury_vbnb / 1e8),  # vBNB has 8 decimals
            "treasury_bnb_in_venus": treasury_bnb_in_venus,
            "supply_rate_per_block": rate_per_block
        }
        cache_manager.set("venus_stats", result, ttl=30)
        return result
    except Exception as e:
        return {"error": str(e)}


async def get_airdrop_stats() -> dict:
    """Airdrop claims count."""
    cached = cache_manager.get("airdrop_stats")
    if cached: return cached

    try:
        w3 = _w3()
        token = w3.eth.contract(address=DWALL_TOKEN, abi=ERC20_ABI)
        airdrop_bal = token.functions.balanceOf(AIRDROP).call()
        # Airdrop contract holds full 150M DWALL allocation (15% supply)
        # But program only distributes 250 wallets * 100 DWALL = 25000 DWALL
        initial_program = 150_000_000  # tokens en el contrato
        remaining_dwall = float(w3.from_wei(airdrop_bal, "ether"))
        distributed = initial_program - remaining_dwall
        claims_count = max(0, int(round(distributed / 100)))

        result = {
            "airdrop_contract_balance_dwall": remaining_dwall,
            "dwall_distributed": distributed,
            "claims_completed": claims_count,
            "max_claims": 250,
            "remaining_slots": max(0, 250 - claims_count),
            "progress_percent": round(claims_count / 250 * 100, 2)
        }
        cache_manager.set("airdrop_stats", result, ttl=120)
        return result
    except Exception as e:
        return {"error": str(e)}
