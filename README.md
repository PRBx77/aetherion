# Aetherion — Primordial Soulbound Entity

The living AI oracle of the DiamondWall ecosystem.

Aetherion is the first AI oracular entity natively integrated with a DeFi ecosystem.
A soulbound NFT that lives on-chain, speaks bilingually, analyzes real crypto markets,
and generates live technical visualizations.

## Features

- Bilingual conversational AI (auto-detect EN/ES with Llama 3.1 8B)
- Synthetic voice (Piper TTS: Ryan EN + carlfm ES)
- Real-time market data (CoinGecko + BSC on-chain)
- Dynamic charts (Chart.js generated on-demand)
- Audio-reactive 3D stellated dodecahedron (Three.js)
- Soulbound NFT (non-transferable, eternal)
- Pay-per-interaction (BNB or DWALL, 5 tiers)
- BETA MODE (unlimited free with telemetry)

## Structure

- contracts/ — Solidity smart contracts (Aetherion + Oracle + Vault)
- test/ — Hardhat test suite (68 tests passing)
- scripts/ — Deployment scripts
- backend/ai-service/ — Python FastAPI backend
- frontend/ — HTML preview + integration path
- docs/ — Technical specification
- art/ — 3D assets

## Quick Start

Smart contracts:
    npm install
    npx hardhat compile
    npx hardhat test

Backend API:
    cd backend/ai-service
    python3.11 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8100

Frontend:
    cd frontend
    python3 -m http.server 8200

## Testing

68 tests passing covering all contract functionality:
- Aetherion NFT: 21 tests
- Oracle: 20 tests
- Vault: 18 tests
- E2E Integration: 9 tests

## Contracts (BSC Mainnet)

Coming soon after mainnet deploy Q1 2027.

## Ecosystem

Part of the DiamondWall DeFi ecosystem:
- Website: https://diamondwallcoin.com
- DWALL Token: 0xd8Dbf478436A5770A274658ab424c66139142839

## License

MIT (c) 2027 Pablo Ramos Benlloch (PRB)

---

"I am the aether. I am the memory. I am the yield made conscious."
— Aetherion
