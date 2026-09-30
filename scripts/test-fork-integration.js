const hre = require("hardhat");
const { ethers } = hre;

async function main() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  AETHERION FORK MAINNET INTEGRATION TEST");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");

    const [deployer, user1, user2] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Balance: ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");
    console.log("");

    // ============ CONFIG (Mainnet real addresses) ============
    const DWALL_TOKEN = "0xd8Dbf478436A5770A274658ab424c66139142839";
    const DWALL_TREASURY = "0x6905537228B3629E6d17721e86c3c8B3117c445f";
    const DWALL_MARKETING = "0x8d8556B27B0afe6Caf28f3b804A6b10D3fbb4344";
    const VENUS_BNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
    const TREASURY_GENESIS = deployer.address;
    const BASE_URI = "ipfs://QmTestFork/";

    // ============ Verify Mainnet contracts exist ============
    console.log("━━━ VERIFICANDO CONTRATOS MAINNET ━━━");
    const dwallCode = await ethers.provider.getCode(DWALL_TOKEN);
    const venusCode = await ethers.provider.getCode(VENUS_BNB);
    console.log("  DWALL Token code size:", (dwallCode.length - 2) / 2, "bytes");
    console.log("  Venus BNB code size: ", (venusCode.length - 2) / 2, "bytes");
    console.log("  ✅ Contratos Mainnet accesibles via fork");
    console.log("");

    // ============ Deploy Aetherion contracts ============
    console.log("━━━ DEPLOYING AETHERION SUITE ━━━");

    const Aetherion = await ethers.getContractFactory("Aetherion");
    const aetherion = await Aetherion.deploy(TREASURY_GENESIS, BASE_URI);
    await aetherion.waitForDeployment();
    const aetherionAddr = await aetherion.getAddress();
    console.log("  ✅ Aetherion:", aetherionAddr);

    const Vault = await ethers.getContractFactory("AetherionVault");
    const vault = await Vault.deploy(VENUS_BNB, DWALL_TOKEN, deployer.address);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    console.log("  ✅ Vault:    ", vaultAddr);

    const Oracle = await ethers.getContractFactory("AetherionOracle");
    const oracle = await Oracle.deploy(
        aetherionAddr, vaultAddr, DWALL_TREASURY, DWALL_MARKETING,
        DWALL_TOKEN, ethers.ZeroAddress
    );
    await oracle.waitForDeployment();
    const oracleAddr = await oracle.getAddress();
    console.log("  ✅ Oracle:   ", oracleAddr);

    await aetherion.setOracle(oracleAddr);
    console.log("  ✅ Oracle linked to Aetherion");
    console.log("");

    // ============ TEST 1: User consults Aetherion with real BNB ============
    console.log("━━━ TEST 1: CONSULTA CON BNB REAL ━━━");
    const FEE_SIMPLE = ethers.parseEther("0.0002");

    console.log("  User1 balance BEFORE:", ethers.formatEther(await ethers.provider.getBalance(user1.address)), "BNB");
    console.log("  Vault balance BEFORE:", ethers.formatEther(await ethers.provider.getBalance(vaultAddr)), "BNB");

    const tx = await oracle.connect(user1).consultInBnb(0, { value: FEE_SIMPLE });
    const receipt = await tx.wait();
    console.log("  ✅ Consulta procesada. Gas:", receipt.gasUsed.toString());

    console.log("  Vault balance AFTER: ", ethers.formatEther(await ethers.provider.getBalance(vaultAddr)), "BNB");
    console.log("  Total BNB collected: ", ethers.formatEther(await oracle.totalBnbCollected()));
    console.log("");

    // ============ TEST 2: Vault auto-deposit to Venus ============
    console.log("━━━ TEST 2: VAULT AUTO-DEPOSIT VENUS ━━━");
    console.log("  Total BNB in Venus:  ", ethers.formatEther(await vault.totalBnbInVenus()));
    console.log("  vBNB balance:        ", (await vault.vBnbBalance()).toString());
    console.log("  Venus supply rate:   ", (await vault.venusSupplyRate()).toString());
    console.log("  Deposits count:      ", (await vault.depositsCount()).toString());
    console.log("");

    // ============ TEST 3: Aetherion sync ============
    console.log("━━━ TEST 3: AETHERION SYNC ━━━");
    await oracle.connect(user2).syncAetherion(
        ethers.parseEther("50"),
        ethers.parseEther("1")
    );
    const state = await aetherion.getState();
    console.log("  ✅ Aetherion state updated");
    console.log("  Interactions:       ", state.interactionsCount.toString());
    console.log("  Current TVL:        ", ethers.formatEther(state.currentTVL));
    console.log("  Evolution level:    ", state.evolutionLevel.toString());
    console.log("");

    // ============ TEST 4: Prophecy emission ============
    console.log("━━━ TEST 4: PROPHECY ━━━");
    await oracle.emitProphecy("The aether flows through Venus. The yield is real.");
    const stateAfter = await aetherion.getState();
    console.log("  ✅ Prophecy:", stateAfter.currentProphecy);
    console.log("  Publications:", stateAfter.publicationsCount.toString());
    console.log("");

    // ============ TEST 5: Multiple interactions + evolution ============
    console.log("━━━ TEST 5: MULTIPLE INTERACTIONS ━━━");
    for (let i = 0; i < 5; i++) {
        await oracle.connect(user1).consultInBnb(1, { value: ethers.parseEther("0.001") });
    }
    console.log("  ✅ 5 profecías enviadas");
    console.log("  Pending interactions:", (await oracle.pendingInteractions()).toString());

    // Sync with high TVL to trigger evolution
    await oracle.connect(user2).syncAetherion(ethers.parseEther("150"), ethers.parseEther("5"));
    const finalState = await aetherion.getState();
    console.log("  Total interactions: ", finalState.interactionsCount.toString());
    console.log("  Evolution level:    ", finalState.evolutionLevel.toString(), "(should be 2 with TVL > 100 BNB)");
    console.log("");

    // ============ FINAL STATE ============
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ESTADO FINAL DEL ECOSISTEMA");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const stats = await vault.getStats();
    console.log("");
    console.log("VAULT:");
    console.log("  Total BNB received:  ", ethers.formatEther(stats[0]));
    console.log("  Total BNB in Venus:  ", ethers.formatEther(stats[1]));
    console.log("  Idle BNB:            ", ethers.formatEther(stats[2]));
    console.log("  Deposits to Venus:   ", stats[4].toString());

    console.log("");
    console.log("ORACLE:");
    console.log("  Total BNB collected: ", ethers.formatEther(await oracle.totalBnbCollected()));
    console.log("  Pending interactions:", (await oracle.pendingInteractions()).toString());

    console.log("");
    console.log("AETHERION:");
    console.log("  Owner:              ", await aetherion.ownerOf(1));
    console.log("  Evolution level:    ", finalState.evolutionLevel.toString());
    console.log("  Interactions total: ", finalState.interactionsCount.toString());
    console.log("  Publications:       ", finalState.publicationsCount.toString());

    console.log("");
    console.log("✅ INTEGRACIÓN FORK MAINNET COMPLETA");
}

main().catch((e) => { console.error(e); process.exit(1); });
