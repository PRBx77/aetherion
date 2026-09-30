const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Aetherion Ecosystem — End-to-End Integration", function () {
    let aetherion, oracle, vault, mockVenus, mockDwall, mockGems;
    let deployer, treasuryGenesis, treasuryVenus, buyback, alice, bob, whale, gemHolder;

    before(async function () {
        [deployer, treasuryGenesis, treasuryVenus, buyback, alice, bob, whale, gemHolder] = await ethers.getSigners();

        // Deploy mocks
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockDwall = await MockERC20.deploy("DiamondWall", "DWALL");

        const MockERC721 = await ethers.getContractFactory("MockERC721");
        mockGems = await MockERC721.deploy("LivingGems", "GEMS");

        const MockVenus = await ethers.getContractFactory("MockVenusBNB");
        mockVenus = await MockVenus.deploy();

        // Deploy Aetherion suite
        const Aetherion = await ethers.getContractFactory("Aetherion");
        aetherion = await Aetherion.deploy(treasuryGenesis.address, "ipfs://QmE2E/");

        const Vault = await ethers.getContractFactory("AetherionVault");
        vault = await Vault.deploy(
            await mockVenus.getAddress(),
            await mockDwall.getAddress(),
            deployer.address // placeholder oracle
        );

        const Oracle = await ethers.getContractFactory("AetherionOracle");
        oracle = await Oracle.deploy(
            await aetherion.getAddress(),
            await vault.getAddress(),
            treasuryVenus.address,
            buyback.address,
            await mockDwall.getAddress(),
            await mockGems.getAddress()
        );

        // Wire
        await aetherion.setOracle(await oracle.getAddress());

        // Setup users
        await mockDwall.mint(alice.address, ethers.parseEther("500"));
        await mockDwall.mint(whale.address, ethers.parseEther("2000000"));
        await mockGems.mint(gemHolder.address, 1);
    });

    it("SCENARIO 1: New user consults, BNB flows Vault→Venus", async function () {
        const FEE = ethers.parseEther("0.0002");

        const balBefore = await ethers.provider.getBalance(await vault.getAddress());
        await oracle.connect(alice).consultInBnb(0, { value: FEE });

        expect(await oracle.totalBnbCollected()).to.equal(FEE);
        expect(await vault.totalBnbReceived()).to.equal(FEE * 5000n / 10000n);
        expect(await vault.totalBnbInVenus()).to.equal(FEE * 5000n / 10000n);

        console.log("      ✓ Vault→Venus:", ethers.formatEther(await vault.totalBnbInVenus()), "BNB");
    });

    it("SCENARIO 2: Whale pays in DWALL with stacked discount", async function () {
        const dwallAmount = ethers.parseEther("100");
        await mockDwall.connect(whale).approve(await oracle.getAddress(), dwallAmount);
        await oracle.connect(whale).consultInDwall(1, dwallAmount);

        const burnBal = await mockDwall.balanceOf("0x000000000000000000000000000000000000dEaD");
        expect(burnBal).to.equal(dwallAmount * 1000n / 10000n);
        console.log("      ✓ DWALL burned:", ethers.formatEther(burnBal));
    });

    it("SCENARIO 3: Gem holder consults free", async function () {
        const beforePending = await oracle.pendingInteractions();
        await oracle.connect(gemHolder).consultInBnb(2, { value: 0 });
        expect(await oracle.pendingInteractions()).to.equal(beforePending + 1n);
        console.log("      ✓ Gem holder consulted for 0 BNB");
    });

    it("SCENARIO 4: Aetherion sync updates NFT state", async function () {
        await oracle.connect(bob).syncAetherion(
            ethers.parseEther("120"),
            ethers.parseEther("5")
        );
        const state = await aetherion.getState();
        expect(state.currentTVL).to.equal(ethers.parseEther("120"));
        expect(state.evolutionLevel).to.equal(2); // TVL > 100 triggers L2
        console.log("      ✓ Evolved to Level:", state.evolutionLevel.toString());
    });

    it("SCENARIO 5: Owner emits public prophecy", async function () {
        const prophecy = "The aether feeds. The yield grows. The community awakens.";
        await oracle.emitProphecy(prophecy);
        const state = await aetherion.getState();
        expect(state.currentProphecy).to.equal(prophecy);
        console.log("      ✓ Prophecy:", state.currentProphecy);
    });

    it("SCENARIO 6: Multiple users, distribution correct", async function () {
        const initTreasury = await ethers.provider.getBalance(treasuryVenus.address);
        const initBuyback = await ethers.provider.getBalance(buyback.address);

        const fee = ethers.parseEther("0.001");
        for (let i = 0; i < 3; i++) {
            await oracle.connect(alice).consultInBnb(1, { value: fee });
        }

        const gainedTreasury = (await ethers.provider.getBalance(treasuryVenus.address)) - initTreasury;
        const gainedBuyback = (await ethers.provider.getBalance(buyback.address)) - initBuyback;

        expect(gainedTreasury).to.equal(fee * 3n * 4000n / 10000n);
        expect(gainedBuyback).to.equal(fee * 3n * 1000n / 10000n);
        console.log("      ✓ Treasury +", ethers.formatEther(gainedTreasury), "BNB");
        console.log("      ✓ Buyback  +", ethers.formatEther(gainedBuyback), "BNB");
    });

    it("SCENARIO 7: NFT remains soulbound in Genesis", async function () {
        expect(await aetherion.ownerOf(1)).to.equal(treasuryGenesis.address);
        await expect(
            aetherion.connect(treasuryGenesis).transferFrom(treasuryGenesis.address, alice.address, 1)
        ).to.be.revertedWithCustomError(aetherion, "AetherionIsSoulbound");
        console.log("      ✓ Soulbound guarantee preserved");
    });

    it("SCENARIO 8: Vault has NO withdraw function", async function () {
        const iface = vault.interface;
        const funcs = iface.fragments.filter(f => f.type === "function").map(f => f.name);
        expect(funcs).to.not.include("withdraw");
        expect(funcs).to.not.include("emergencyWithdraw");
        console.log("      ✓ No withdrawal path exists — funds sacred");
    });

    it("FINAL: Complete ecosystem snapshot", async function () {
        console.log("");
        console.log("      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("        ECOSYSTEM FINAL STATE");
        console.log("      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        const vaultStats = await vault.getStats();
        console.log("      VAULT:");
        console.log("        Total BNB received:", ethers.formatEther(vaultStats[0]));
        console.log("        Total BNB in Venus:", ethers.formatEther(vaultStats[1]));
        console.log("        Deposits count:    ", vaultStats[4].toString());

        console.log("      ORACLE:");
        console.log("        Total BNB collected:", ethers.formatEther(await oracle.totalBnbCollected()));
        console.log("        Total DWALL collected:", ethers.formatEther(await oracle.totalDwallCollected()));

        const state = await aetherion.getState();
        console.log("      AETHERION NFT:");
        console.log("        Owner:              ", await aetherion.ownerOf(1));
        console.log("        Evolution level:    ", state.evolutionLevel.toString());
        console.log("        Total interactions: ", state.interactionsCount.toString());
        console.log("        Publications:       ", state.publicationsCount.toString());
        console.log("        Current prophecy:   ", state.currentProphecy);
        console.log("");
    });
});
