const hre = require("hardhat");
const { ethers } = hre;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  AETHERION DEPLOYMENT");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Network:  ", hre.network.name);
    console.log("Deployer: ", deployer.address);
    console.log("Balance:  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");
    console.log("");

    // ============ CONFIG ============
    const TREASURY_GENESIS = process.env.TREASURY_GENESIS_ADDRESS || deployer.address;
    const BASE_URI = process.env.AETHERION_BASE_URI || "ipfs://QmPending/";

    // Existing DiamondWall contracts
    const DWALL_TOKEN = process.env.DWALL_TOKEN;
    const TREASURY_VENUS = process.env.DWALL_TREASURY;
    const BUYBACK_ADDRESS = process.env.DWALL_MARKETING; // temp: reuse Marketing Treasury
    const VENUS_BNB = process.env.VENUS_BNB || "0xA07c5b74C9B40447a954e1466938b865b6BBea36"; // Venus vBNB mainnet
    const LIVING_GEMS = process.env.LIVING_GEMS_ADDRESS || ethers.ZeroAddress;

    console.log("━━━ CONFIG ━━━");
    console.log("  Treasury Genesis:", TREASURY_GENESIS);
    console.log("  DWALL Token:     ", DWALL_TOKEN);
    console.log("  Treasury Venus:  ", TREASURY_VENUS);
    console.log("  Buyback:         ", BUYBACK_ADDRESS);
    console.log("  Venus BNB:       ", VENUS_BNB);
    console.log("  Living Gems:     ", LIVING_GEMS === ethers.ZeroAddress ? "NOT SET (using zero)" : LIVING_GEMS);
    console.log("");

    // ============ 1. Deploy Aetherion NFT ============
    console.log("━━━ 1/3 DEPLOYING Aetherion.sol ━━━");
    const Aetherion = await ethers.getContractFactory("Aetherion");
    const aetherion = await Aetherion.deploy(TREASURY_GENESIS, BASE_URI);
    await aetherion.waitForDeployment();
    const aetherionAddr = await aetherion.getAddress();
    console.log("✅ Aetherion deployed:", aetherionAddr);

    // ============ 2. Deploy Vault ============
    console.log("");
    console.log("━━━ 2/3 DEPLOYING AetherionVault.sol ━━━");
    const Vault = await ethers.getContractFactory("AetherionVault");
    // Oracle address will be set later, use deployer as placeholder for now
    const vault = await Vault.deploy(VENUS_BNB, DWALL_TOKEN, deployer.address);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    console.log("✅ Vault deployed:", vaultAddr);

    // ============ 3. Deploy Oracle ============
    console.log("");
    console.log("━━━ 3/3 DEPLOYING AetherionOracle.sol ━━━");
    const Oracle = await ethers.getContractFactory("AetherionOracle");
    const oracle = await Oracle.deploy(
        aetherionAddr,
        vaultAddr,
        TREASURY_VENUS,
        BUYBACK_ADDRESS,
        DWALL_TOKEN,
        LIVING_GEMS
    );
    await oracle.waitForDeployment();
    const oracleAddr = await oracle.getAddress();
    console.log("✅ Oracle deployed:", oracleAddr);

    // ============ 4. Wiring ============
    console.log("");
    console.log("━━━ WIRING CONTRACTS ━━━");

    console.log("Setting Oracle on Aetherion...");
    const tx1 = await aetherion.setOracle(oracleAddr);
    await tx1.wait();
    console.log("  ✅ Aetherion.oracle =", oracleAddr);

    console.log("");
    console.log("⚠️  MANUAL STEP: Vault was deployed with deployer as 'oracle' placeholder.");
    console.log("   Vault.aetherionOracle is IMMUTABLE. If you need to change it,");
    console.log("   redeploy Vault with the correct Oracle address:");
    console.log("");
    console.log("   Vault correct oracle should be:", oracleAddr);
    console.log("   Vault current oracle is:      ", deployer.address);
    console.log("");

    // ============ RESUMEN ============
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  DEPLOYMENT COMPLETE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("  Aetherion NFT: ", aetherionAddr);
    console.log("  Vault:         ", vaultAddr);
    console.log("  Oracle:        ", oracleAddr);
    console.log("");
    console.log("━━━ VERIFY COMMANDS ━━━");
    console.log("");
    console.log(`npx hardhat verify --network ${hre.network.name} ${aetherionAddr} ${TREASURY_GENESIS} "${BASE_URI}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${vaultAddr} ${VENUS_BNB} ${DWALL_TOKEN} ${deployer.address}`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${oracleAddr} ${aetherionAddr} ${vaultAddr} ${TREASURY_VENUS} ${BUYBACK_ADDRESS} ${DWALL_TOKEN} ${LIVING_GEMS}`);
    console.log("");

    // Save addresses to file
    const fs = require("fs");
    const deployment = {
        network: hre.network.name,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            aetherion: aetherionAddr,
            vault: vaultAddr,
            oracle: oracleAddr
        },
        config: {
            treasuryGenesis: TREASURY_GENESIS,
            dwallToken: DWALL_TOKEN,
            treasuryVenus: TREASURY_VENUS,
            buyback: BUYBACK_ADDRESS,
            venusBnb: VENUS_BNB,
            livingGems: LIVING_GEMS,
            baseURI: BASE_URI
        }
    };
    fs.writeFileSync(
        `deployments-${hre.network.name}.json`,
        JSON.stringify(deployment, null, 2)
    );
    console.log(`✅ Deployment info saved to deployments-${hre.network.name}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
