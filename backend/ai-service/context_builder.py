"""
Construye contexto on-chain para Aetherion.
Lee estado del NFT via Web3.
"""
import os
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

RPC = os.getenv("RPC_BSC_MAINNET", "https://bsc-dataseed.binance.org/")
AETHERION_ADDRESS = os.getenv("AETHERION_CONTRACT", "")

# Minimal ABI para leer getState()
ABI = [{
    "inputs": [],
    "name": "getState",
    "outputs": [{
        "components": [
            {"name": "currentTVL", "type": "uint256"},
            {"name": "evolutionLevel", "type": "uint8"},
            {"name": "totalYieldGenerated", "type": "uint256"},
            {"name": "daysSinceGenesis", "type": "uint256"},
            {"name": "lastVisualUpdate", "type": "uint256"},
            {"name": "currentProphecy", "type": "string"},
            {"name": "publicationsCount", "type": "uint32"},
            {"name": "interactionsCount", "type": "uint32"}
        ],
        "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
}]


def get_ecosystem_state() -> dict:
    """
    Lee estado on-chain de Aetherion.
    Devuelve estado por defecto si no hay contrato deployado.
    """
    default = {
        "evolution_level": 1,
        "interactions": 0,
        "tvl": 0,
        "days": 0,
        "prophecy": "The Aether awakens.",
        "publications": 0
    }

    if not AETHERION_ADDRESS or AETHERION_ADDRESS == "":
        return default

    try:
        w3 = Web3(Web3.HTTPProvider(RPC))
        if not w3.is_connected():
            return default
        contract = w3.eth.contract(address=AETHERION_ADDRESS, abi=ABI)
        state = contract.functions.getState().call()
        return {
            "evolution_level": state[1],
            "interactions": state[7],
            "tvl": w3.from_wei(state[0], "ether"),
            "days": state[3],
            "prophecy": state[5],
            "publications": state[6]
        }
    except Exception as e:
        print(f"[context_builder] Error reading on-chain: {e}")
        return default


if __name__ == "__main__":
    print("Ecosystem state:", get_ecosystem_state())
