require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, BSCSCAN_API_KEY, RPC_BSC_MAINNET, RPC_BSC_TESTNET } = process.env;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun"
    }
  },
  networks: {
    bsc: {
      url: RPC_BSC_MAINNET || "https://bsc-dataseed.binance.org/",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 56
    },
    bscTestnet: {
      url: RPC_BSC_TESTNET || "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97
    }
  },
  etherscan: {
    apiKey: { bsc: BSCSCAN_API_KEY, bscTestnet: BSCSCAN_API_KEY }
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" }
};
