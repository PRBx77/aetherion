const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB\n");

  // Aetherion YA desplegado
  const AETHERION_ADDR = "0x2fF1754cf8938000cca51e7C32E405A92EBD0F85";
  console.log("Aetherion (existente):", AETHERION_ADDR);

  const DWALL_TOKEN = process.env.DWALL_TOKEN;
  const TREASURY_VENUS = process.env.DWALL_TREASURY;
  const BUYBACK = process.env.DWALL_MARKETING;
  const VENUS_BNB = process.env.VENUS_BNB;
  const LIVING_GEMS = process.env.LIVING_GEMS_ADDRESS || ethers.ZeroAddress;

  console.log("DWALL:   ", DWALL_TOKEN);
  console.log("Treasury:", TREASURY_VENUS);
  console.log("Buyback: ", BUYBACK);
  console.log("Venus:   ", VENUS_BNB);
  console.log("Gems:    ", LIVING_GEMS);
  console.log();

  // 1. Vault
  console.log("━━━ Deploying Vault ━━━");
  const Vault = await ethers.getContractFactory("AetherionVault");
  const vault = await Vault.deploy(VENUS_BNB, DWALL_TOKEN, deployer.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("✅ Vault:", vaultAddr);

  // 2. Oracle
  console.log("\n━━━ Deploying Oracle ━━━");
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

  // 3. Vault.setOracle(oracle)
  console.log("\n━━━ Linking Vault → Oracle ━━━");
  const tx = await vault.setOracle(oracleAddr);
  await tx.wait();
  console.log("✅ Vault.oracle = Oracle");

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("DEPLOYMENT COMPLETE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Aetherion:", AETHERION_ADDR);
  console.log("Vault:    ", vaultAddr);
  console.log("Oracle:   ", oracleAddr);
  console.log("\nVerify commands:");
  console.log(`npx hardhat verify --network bsc ${AETHERION_ADDR} ${deployer.address} "${process.env.AETHERION_BASE_URI}"`);
  console.log(`npx hardhat verify --network bsc ${vaultAddr} ${VENUS_BNB} ${DWALL_TOKEN} ${deployer.address}`);
  console.log(`npx hardhat verify --network bsc ${oracleAddr} ${AETHERION_ADDR} ${vaultAddr} ${TREASURY_VENUS} ${BUYBACK} ${DWALL_TOKEN} ${LIVING_GEMS}`);
}

main().catch(e => { console.error(e); process.exit(1); });
