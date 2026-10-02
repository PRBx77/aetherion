const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB\n");

  const AETHERION_ADDR = "0x2fF1754cf8938000cca51e7C32E405A92EBD0F85";
  const DWALL_TOKEN = process.env.DWALL_TOKEN;
  const TREASURY_VENUS = process.env.DWALL_TREASURY;
  const BUYBACK = process.env.DWALL_MARKETING;
  const VENUS_BNB = process.env.VENUS_BNB;
  const LIVING_GEMS = process.env.LIVING_GEMS_ADDRESS || ethers.ZeroAddress;

  // Nonce actual del deployer
  const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  console.log("Current nonce:", currentNonce);

  // Vault se desplegará con nonce actual, Oracle con nonce+1
  const futureVaultAddr = ethers.getCreateAddress({ from: deployer.address, nonce: currentNonce });
  const futureOracleAddr = ethers.getCreateAddress({ from: deployer.address, nonce: currentNonce + 1 });

  console.log("Predicted Vault addr:  ", futureVaultAddr);
  console.log("Predicted Oracle addr: ", futureOracleAddr);
  console.log();

  // 1. Deploy Vault con la dirección predicha del Oracle
  console.log("━━━ Deploying Vault (con Oracle real predicho) ━━━");
  const Vault = await ethers.getContractFactory("AetherionVault");
  const vault = await Vault.deploy(VENUS_BNB, DWALL_TOKEN, futureOracleAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("✅ Vault:", vaultAddr);
  if (vaultAddr.toLowerCase() !== futureVaultAddr.toLowerCase()) {
    throw new Error(`Vault address mismatch! Expected ${futureVaultAddr}, got ${vaultAddr}`);
  }

  // 2. Deploy Oracle con el Vault real
  console.log("\n━━━ Deploying Oracle (con Vault real) ━━━");
  const Oracle = await ethers.getContractFactory("AetherionOracle");
  const oracle = await Oracle.deploy(
    AETHERION_ADDR,
    vaultAddr,
    TREASURY_VENUS,
    BUYBACK,
    DWALL_TOKEN,
    LIVING_GEMS
  );
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("✅ Oracle:", oracleAddr);
  if (oracleAddr.toLowerCase() !== futureOracleAddr.toLowerCase()) {
    throw new Error(`Oracle address mismatch! Expected ${futureOracleAddr}, got ${oracleAddr}`);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("DEPLOYMENT COMPLETE (CORRECT)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Aetherion:", AETHERION_ADDR);
  console.log("Vault:    ", vaultAddr);
  console.log("Oracle:   ", oracleAddr);
  console.log("\n(Contratos previos abandonados — no tienen fondos)");
  console.log("Vault viejo:  0xA30d32A447D2994EE9cc31b435B523a3C76F57d7");
  console.log("Oracle viejo: 0x4019a3F0b2540cde535BF16d79a67B0F25FaDBFD");
}

main().catch(e => { console.error(e); process.exit(1); });
