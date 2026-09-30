const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Aetherion — Primordial Soulbound Entity", function () {
    let aetherion;
    let owner, treasuryGenesis, oracle, alice, bob;
    const BASE_URI = "ipfs://QmTest/";

    beforeEach(async function () {
        [owner, treasuryGenesis, oracle, alice, bob] = await ethers.getSigners();
        const Aetherion = await ethers.getContractFactory("Aetherion");
        aetherion = await Aetherion.deploy(treasuryGenesis.address, BASE_URI);
        await aetherion.waitForDeployment();
    });

    describe("Genesis", function () {
        it("Mints tokenId=1 to Treasury Genesis", async function () {
            expect(await aetherion.ownerOf(1)).to.equal(treasuryGenesis.address);
            expect(await aetherion.balanceOf(treasuryGenesis.address)).to.equal(1);
        });

        it("Cannot deploy with zero address", async function () {
            const Aetherion = await ethers.getContractFactory("Aetherion");
            await expect(
                Aetherion.deploy(ethers.ZeroAddress, BASE_URI)
            ).to.be.revertedWithCustomError(aetherion, "InvalidAddress");
        });

        it("Sets correct initial state", async function () {
            const s = await aetherion.getState();
            expect(s.evolutionLevel).to.equal(1);
            expect(s.currentTVL).to.equal(0);
            expect(s.interactionsCount).to.equal(0);
        });

        it("Has correct name and symbol", async function () {
            expect(await aetherion.name()).to.equal("Aetherion");
            expect(await aetherion.symbol()).to.equal("AETH");
        });
    });

    describe("Soulbound", function () {
        it("transferFrom reverts", async function () {
            await expect(
                aetherion.connect(treasuryGenesis).transferFrom(
                    treasuryGenesis.address, alice.address, 1
                )
            ).to.be.revertedWithCustomError(aetherion, "AetherionIsSoulbound");
        });

        it("safeTransferFrom reverts", async function () {
            await expect(
                aetherion.connect(treasuryGenesis)["safeTransferFrom(address,address,uint256)"](
                    treasuryGenesis.address, alice.address, 1
                )
            ).to.be.reverted;
        });

        it("approve reverts", async function () {
            await expect(
                aetherion.connect(treasuryGenesis).approve(alice.address, 1)
            ).to.be.revertedWithCustomError(aetherion, "AetherionNonApprovable");
        });

        it("setApprovalForAll reverts", async function () {
            await expect(
                aetherion.connect(treasuryGenesis).setApprovalForAll(alice.address, true)
            ).to.be.revertedWithCustomError(aetherion, "AetherionNonApprovable");
        });
    });

    describe("Oracle Management", function () {
        it("Owner sets oracle", async function () {
            await aetherion.setOracle(oracle.address);
            expect(await aetherion.oracle()).to.equal(oracle.address);
        });

        it("Non-owner cannot set oracle", async function () {
            await expect(aetherion.connect(alice).setOracle(oracle.address)).to.be.reverted;
        });

        it("Cannot set zero address as oracle", async function () {
            await expect(
                aetherion.setOracle(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(aetherion, "InvalidAddress");
        });
    });

    describe("State Updates", function () {
        beforeEach(async () => { await aetherion.setOracle(oracle.address); });

        it("Oracle updates state", async function () {
            await aetherion.connect(oracle).updateState(
                ethers.parseEther("50"), ethers.parseEther("5"), 10
            );
            const s = await aetherion.getState();
            expect(s.currentTVL).to.equal(ethers.parseEther("50"));
            expect(s.interactionsCount).to.equal(10);
        });

        it("Non-oracle blocked", async function () {
            await expect(
                aetherion.connect(alice).updateState(1, 1, 1)
            ).to.be.revertedWithCustomError(aetherion, "OnlyOracle");
        });

        it("Oracle reveals prophecy", async function () {
            await aetherion.connect(oracle).revealProphecy("Yield flows eternal.");
            const s = await aetherion.getState();
            expect(s.currentProphecy).to.equal("Yield flows eternal.");
            expect(s.publicationsCount).to.equal(1);
        });
    });

    describe("Evolution", function () {
        beforeEach(async () => { await aetherion.setOracle(oracle.address); });

        it("Auto-evolves L1→L2 with TVL threshold", async function () {
            await aetherion.connect(oracle).updateState(ethers.parseEther("150"), 0, 0);
            expect((await aetherion.getState()).evolutionLevel).to.equal(2);
        });

        it("Owner force-sets evolution level", async function () {
            await aetherion.forceEvolutionLevel(3);
            expect((await aetherion.getState()).evolutionLevel).to.equal(3);
        });

        it("Rejects invalid level", async function () {
            await expect(
                aetherion.forceEvolutionLevel(0)
            ).to.be.revertedWithCustomError(aetherion, "InvalidLevel");
            await expect(
                aetherion.forceEvolutionLevel(5)
            ).to.be.revertedWithCustomError(aetherion, "InvalidLevel");
        });
    });

    describe("Dynamic tokenURI", function () {
        it("Returns URI based on level", async function () {
            expect(await aetherion.tokenURI(1)).to.equal(BASE_URI + "state_1.json");
            await aetherion.forceEvolutionLevel(3);
            expect(await aetherion.tokenURI(1)).to.equal(BASE_URI + "state_3.json");
        });

        it("Owner updates baseURI", async function () {
            await aetherion.setBaseURI("ipfs://NewHash/");
            expect(await aetherion.tokenURI(1)).to.equal("ipfs://NewHash/state_1.json");
        });
    });

    describe("Constants", function () {
        it("TOKEN_ID = 1", async function () {
            expect(await aetherion.TOKEN_ID()).to.equal(1);
        });

        it("MAX_EVOLUTION_LEVEL = 4", async function () {
            expect(await aetherion.MAX_EVOLUTION_LEVEL()).to.equal(4);
        });
    });
});
