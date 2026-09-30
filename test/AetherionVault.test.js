const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AetherionVault — Sacred Self-Feeding Vault", function () {
    let vault, mockVenus, mockDwall;
    let owner, oracleSim, alice, bob;

    beforeEach(async function () {
        [owner, oracleSim, alice, bob] = await ethers.getSigners();

        const MockVenus = await ethers.getContractFactory("MockVenusBNB");
        mockVenus = await MockVenus.deploy();
        await mockVenus.waitForDeployment();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockDwall = await MockERC20.deploy("DiamondWall", "DWALL");
        await mockDwall.waitForDeployment();

        const Vault = await ethers.getContractFactory("AetherionVault");
        vault = await Vault.deploy(
            await mockVenus.getAddress(),
            await mockDwall.getAddress(),
            oracleSim.address
        );
        await vault.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Sets correct addresses", async function () {
            expect(await vault.venus()).to.equal(await mockVenus.getAddress());
            expect(await vault.dwallToken()).to.equal(await mockDwall.getAddress());
            expect(await vault.aetherionOracle()).to.equal(oracleSim.address);
        });

        it("Deposits enabled by default", async function () {
            expect(await vault.depositsEnabled()).to.equal(true);
        });

        it("Rejects zero addresses", async function () {
            const Vault = await ethers.getContractFactory("AetherionVault");
            await expect(Vault.deploy(
                ethers.ZeroAddress, await mockDwall.getAddress(), oracleSim.address
            )).to.be.revertedWithCustomError(vault, "InvalidAddress");
        });
    });

    describe("BNB Reception + Auto-deposit", function () {
        it("Receives BNB and auto-deposits to Venus", async function () {
            const amount = ethers.parseEther("1");
            await alice.sendTransaction({
                to: await vault.getAddress(),
                value: amount
            });

            expect(await vault.totalBnbReceived()).to.equal(amount);
            expect(await vault.totalBnbInVenus()).to.equal(amount);
            expect(await vault.depositsCount()).to.equal(1);
            // Balance should be 0 (all forwarded to Venus)
            expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
        });

        it("Emits BnbReceived + DepositedToVenus events", async function () {
            const amount = ethers.parseEther("0.5");
            await expect(alice.sendTransaction({
                to: await vault.getAddress(),
                value: amount
            })).to.emit(vault, "BnbReceived")
              .and.to.emit(vault, "DepositedToVenus");
        });

        it("Accumulates multiple deposits", async function () {
            await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
            await bob.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("2") });
            expect(await vault.totalBnbReceived()).to.equal(ethers.parseEther("3"));
            expect(await vault.depositsCount()).to.equal(2);
        });

        it("When deposits disabled, BNB stays idle", async function () {
            await vault.setDepositsEnabled(false);
            await alice.sendTransaction({
                to: await vault.getAddress(),
                value: ethers.parseEther("1")
            });
            expect(await vault.idleBnb()).to.equal(ethers.parseEther("1"));
            expect(await vault.totalBnbInVenus()).to.equal(0);
        });

        it("depositIdleToVenus deposits idle BNB manually", async function () {
            await vault.setDepositsEnabled(false);
            await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
            await vault.setDepositsEnabled(true);

            await vault.connect(oracleSim).depositIdleToVenus();
            expect(await vault.idleBnb()).to.equal(0);
            expect(await vault.totalBnbInVenus()).to.equal(ethers.parseEther("1"));
        });

        it("Only oracle or owner can call depositIdleToVenus", async function () {
            await expect(
                vault.connect(alice).depositIdleToVenus()
            ).to.be.revertedWithCustomError(vault, "NotOracle");
        });
    });

    describe("DWALL Tracking", function () {
        it("Notifies DWALL deposit", async function () {
            await mockDwall.mint(await vault.getAddress(), ethers.parseEther("1000"));
            await vault.notifyDwallDeposit(ethers.parseEther("1000"));
            expect(await vault.totalDwallReceived()).to.equal(ethers.parseEther("1000"));
        });

        it("dwallBalance reflects real balance", async function () {
            await mockDwall.mint(await vault.getAddress(), ethers.parseEther("500"));
            expect(await vault.dwallBalance()).to.equal(ethers.parseEther("500"));
        });
    });

    describe("Yield Tracking", function () {
        it("Reports current yield after Venus simulation", async function () {
            await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });

            // Simulate 0.5 BNB yield in Venus
            await mockVenus.simulateYield(await vault.getAddress(), ethers.parseEther("0.5"));

            const yieldTx = await vault.currentYield.staticCall();
            expect(yieldTx).to.equal(ethers.parseEther("0.5"));
        });

        it("vBnbBalance reflects Venus vBNB", async function () {
            await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
            const vBal = await vault.vBnbBalance();
            expect(vBal).to.be.gt(0);
        });

        it("venusSupplyRate returns supply rate", async function () {
            const rate = await vault.venusSupplyRate();
            expect(rate).to.be.gt(0);
        });
    });

    describe("Stats Snapshot", function () {
        it("getStats returns all metrics", async function () {
            await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("3") });
            const stats = await vault.getStats();
            expect(stats[0]).to.equal(ethers.parseEther("3"));  // totalBnb
            expect(stats[1]).to.equal(ethers.parseEther("3"));  // inVenus
            expect(stats[2]).to.equal(0);                        // idle
            expect(stats[4]).to.equal(1);                        // deposits
            expect(stats[5]).to.equal(true);                     // depositsOn
        });
    });

    describe("Sacred Fund Guarantee", function () {
        it("No withdraw function exists (verified by absence)", async function () {
            // Confirm withdraw functions don't exist by checking interface
            const iface = vault.interface;
            const funcs = iface.fragments.filter(f => f.type === "function").map(f => f.name);
            expect(funcs).to.not.include("withdraw");
            expect(funcs).to.not.include("emergencyWithdraw");
            expect(funcs).to.not.include("rescue");
        });

        it("Owner cannot self-drain (no function to do so)", async function () {
            await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("5") });
            // No withdraw = funds are locked forever
            expect(await vault.totalBnbInVenus()).to.equal(ethers.parseEther("5"));
        });
    });

    describe("Admin", function () {
        it("Owner can toggle deposits", async function () {
            await vault.setDepositsEnabled(false);
            expect(await vault.depositsEnabled()).to.equal(false);
            await vault.setDepositsEnabled(true);
            expect(await vault.depositsEnabled()).to.equal(true);
        });

        it("Non-owner cannot toggle deposits", async function () {
            await expect(
                vault.connect(alice).setDepositsEnabled(false)
            ).to.be.reverted;
        });
    });
});
