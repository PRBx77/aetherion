const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AetherionOracle — Pay-per-Interaction", function () {
    let aetherion, oracle, mockDwall, mockGems;
    let owner, treasuryGenesis, vault, treasury, buyback, alice, bob, whale, gemHolder;

    const BASE_URI = "ipfs://Test/";
    const FEE_SIMPLE = ethers.parseEther("0.0002");
    const FEE_PROPHECY = ethers.parseEther("0.001");
    const FEE_RITUAL = ethers.parseEther("0.03");

    beforeEach(async function () {
        [owner, treasuryGenesis, vault, treasury, buyback, alice, bob, whale, gemHolder] = await ethers.getSigners();

        // Deploy mock DWALL token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockDwall = await MockERC20.deploy("DiamondWall", "DWALL");
        await mockDwall.waitForDeployment();

        // Deploy mock Living Gems
        const MockERC721 = await ethers.getContractFactory("MockERC721");
        mockGems = await MockERC721.deploy("LivingGems", "GEMS");
        await mockGems.waitForDeployment();

        // Deploy Aetherion NFT
        const Aetherion = await ethers.getContractFactory("Aetherion");
        aetherion = await Aetherion.deploy(treasuryGenesis.address, BASE_URI);
        await aetherion.waitForDeployment();

        // Deploy Oracle
        const Oracle = await ethers.getContractFactory("AetherionOracle");
        oracle = await Oracle.deploy(
            await aetherion.getAddress(),
            vault.address,
            treasury.address,
            buyback.address,
            await mockDwall.getAddress(),
            await mockGems.getAddress()
        );
        await oracle.waitForDeployment();

        // Link Oracle to Aetherion
        await aetherion.setOracle(await oracle.getAddress());

        // Setup balances
        await mockDwall.mint(alice.address, ethers.parseEther("5000"));
        await mockDwall.mint(bob.address, ethers.parseEther("100000"));
        await mockDwall.mint(whale.address, ethers.parseEther("2000000"));

        // Give gemHolder a Living Gem
        await mockGems.mint(gemHolder.address, 1);
    });

    describe("Deployment", function () {
        it("Sets correct addresses", async function () {
            expect(await oracle.aetherion()).to.equal(await aetherion.getAddress());
            expect(await oracle.aetherionVault()).to.equal(vault.address);
            expect(await oracle.treasuryVenus()).to.equal(treasury.address);
            expect(await oracle.buybackAddress()).to.equal(buyback.address);
        });

        it("Rejects zero addresses at deploy", async function () {
            const Oracle = await ethers.getContractFactory("AetherionOracle");
            await expect(Oracle.deploy(
                ethers.ZeroAddress, vault.address, treasury.address,
                buyback.address, await mockDwall.getAddress(), await mockGems.getAddress()
            )).to.be.revertedWithCustomError(oracle, "InvalidAddress");
        });
    });

    describe("Base Fees", function () {
        it("Returns correct base fees", async function () {
            expect(await oracle.getBaseFee(0)).to.equal(FEE_SIMPLE);
            expect(await oracle.getBaseFee(1)).to.equal(FEE_PROPHECY);
            expect(await oracle.getBaseFee(4)).to.equal(FEE_RITUAL);
        });
    });

    describe("Discounts", function () {
        it("No discount for users with < 10K DWALL", async function () {
            const fee = await oracle.getRequiredFee(0, alice.address, false);
            expect(fee).to.equal(FEE_SIMPLE);
        });

        it("Applies -10% for 10K-50K DWALL", async function () {
            await mockDwall.mint(alice.address, ethers.parseEther("10000"));
            const fee = await oracle.getRequiredFee(0, alice.address, false);
            expect(fee).to.equal(FEE_SIMPLE * 90n / 100n);
        });

        it("Applies -50% for 200K-1M DWALL", async function () {
            const fee = await oracle.getRequiredFee(0, bob.address, false);
            // bob has 100K, needs 200K for -50%; should be -25%
            expect(fee).to.equal(FEE_SIMPLE * 75n / 100n);
        });

        it("Applies -75% for whales (>1M DWALL)", async function () {
            const fee = await oracle.getRequiredFee(0, whale.address, false);
            expect(fee).to.equal(FEE_SIMPLE * 25n / 100n);
        });

        it("Living Gem holder pays 0 (free)", async function () {
            const fee = await oracle.getRequiredFee(0, gemHolder.address, false);
            expect(fee).to.equal(0);
        });

        it("Stackable: whale + DWALL payment = -80% cap", async function () {
            const fee = await oracle.getRequiredFee(0, whale.address, true);
            expect(fee).to.equal(FEE_SIMPLE * 20n / 100n);
        });
    });

    describe("BNB Consultations", function () {
        it("Alice pays SIMPLE in BNB", async function () {
            const before = { v: await ethers.provider.getBalance(vault.address),
                             t: await ethers.provider.getBalance(treasury.address),
                             b: await ethers.provider.getBalance(buyback.address) };

            await oracle.connect(alice).consultInBnb(0, { value: FEE_SIMPLE });

            const after = { v: await ethers.provider.getBalance(vault.address),
                            t: await ethers.provider.getBalance(treasury.address),
                            b: await ethers.provider.getBalance(buyback.address) };

            expect(after.v - before.v).to.equal(FEE_SIMPLE * 5000n / 10000n);
            expect(after.t - before.t).to.equal(FEE_SIMPLE * 4000n / 10000n);
            expect(after.b - before.b).to.equal(FEE_SIMPLE * 1000n / 10000n);
        });

        it("Reverts if insufficient offering", async function () {
            await expect(
                oracle.connect(alice).consultInBnb(0, { value: 1 })
            ).to.be.revertedWithCustomError(oracle, "InsufficientOffering");
        });

        it("Increments pendingInteractions", async function () {
            await oracle.connect(alice).consultInBnb(0, { value: FEE_SIMPLE });
            await oracle.connect(alice).consultInBnb(1, { value: FEE_PROPHECY });
            expect(await oracle.pendingInteractions()).to.equal(2);
        });

        it("Tracks totalBnbCollected", async function () {
            await oracle.connect(alice).consultInBnb(4, { value: FEE_RITUAL });
            expect(await oracle.totalBnbCollected()).to.equal(FEE_RITUAL);
        });

        it("Gem holder consults for free", async function () {
            await oracle.connect(gemHolder).consultInBnb(0, { value: 0 });
            expect(await oracle.pendingInteractions()).to.equal(1);
        });
    });

    describe("DWALL Consultations", function () {
        it("Whale pays SIMPLE in DWALL with stacked discount", async function () {
            const required = await oracle.getRequiredFee(0, whale.address, true);
            const dwallAmount = ethers.parseEther("100"); // more than enough

            await mockDwall.connect(whale).approve(await oracle.getAddress(), dwallAmount);
            await oracle.connect(whale).consultInDwall(0, dwallAmount);

            expect(await oracle.totalDwallCollected()).to.equal(dwallAmount);

            // Verify burn: check balance of 0xdead
            const burnBal = await mockDwall.balanceOf("0x000000000000000000000000000000000000dEaD");
            expect(burnBal).to.equal(dwallAmount * 1000n / 10000n);
        });

        it("Reverts if DWALL insufficient", async function () {
            const smallAmount = 1n;
            await mockDwall.connect(alice).approve(await oracle.getAddress(), smallAmount);
            await expect(
                oracle.connect(alice).consultInDwall(0, smallAmount)
            ).to.be.revertedWithCustomError(oracle, "InsufficientOffering");
        });
    });

    describe("Aetherion Sync", function () {
        it("Anyone can sync interactions to Aetherion NFT", async function () {
            await oracle.connect(alice).consultInBnb(0, { value: FEE_SIMPLE });
            await oracle.connect(alice).consultInBnb(0, { value: FEE_SIMPLE });

            await oracle.connect(bob).syncAetherion(
                ethers.parseEther("100"),
                ethers.parseEther("5")
            );

            const state = await aetherion.getState();
            expect(state.interactionsCount).to.equal(2);
            expect(state.currentTVL).to.equal(ethers.parseEther("100"));
            expect(await oracle.pendingInteractions()).to.equal(0);
        });

        it("Only owner can emit prophecy", async function () {
            await oracle.emitProphecy("The yield flows.");
            const state = await aetherion.getState();
            expect(state.currentProphecy).to.equal("The yield flows.");
        });

        it("Non-owner cannot emit prophecy", async function () {
            await expect(
                oracle.connect(alice).emitProphecy("Fake")
            ).to.be.reverted;
        });
    });
});
