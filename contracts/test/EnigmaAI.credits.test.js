// AI-assisted: Used Claude to write these low-balance and credit edge-case tests
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const PRICE = 500_000n; // 0.50 USDT
const TIMEOUT = 3600n;
const EXPIRY = 300;
const FILE_HASH = ethers.keccak256(ethers.toUtf8Bytes("encrypted-file"));
const RESULT_HASH = ethers.keccak256(ethers.toUtf8Bytes("result"));
const ATTEST_HASH = ethers.keccak256(ethers.toUtf8Bytes("attestation"));
const Status = { None: 0n, Pending: 1n, Processing: 2n, Completed: 3n, Failed: 4n, Refunded: 5n, Expired: 6n, KeyDestroyed: 7n };

const COMPLETE = {
  Complete: [
    { name: "jobId", type: "uint256" },
    { name: "user", type: "address" },
    { name: "fileHash", type: "bytes32" },
    { name: "resultHash", type: "bytes32" },
    { name: "attestationHash", type: "bytes32" },
  ],
};

async function deploy() {
  const [owner, provider, company, other, oracle] = await ethers.getSigners();
  const usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const enigma = await (await ethers.getContractFactory("EnigmaAI")).deploy(
    await usdt.getAddress(), provider.address, PRICE, TIMEOUT, owner.address
  );
  await enigma.addSigner(oracle.address);
  await usdt.mint(company.address, 100_000_000n);
  await usdt.connect(company).approve(await enigma.getAddress(), ethers.MaxUint256);
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "EnigmaAI", version: "1", chainId, verifyingContract: await enigma.getAddress() };
  return { owner, provider, company, other, oracle, usdt, enigma, domain };
}

const signComplete = (signer, domain, jobId, user) =>
  signer.signTypedData(domain, COMPLETE, { jobId, user, fileHash: FILE_HASH, resultHash: RESULT_HASH, attestationHash: ATTEST_HASH });

describe("EnigmaAI — low-balance and credit edge cases", () => {
  describe("multi-job balance exhaustion", () => {
    it("allows exactly N jobs for N×price balance, then reverts on N+1", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE * 3n);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      expect(await enigma.balances(company.address)).to.equal(0n);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });

    it("exact-price deposit allows one job, blocks the second", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });
  });

  describe("post-refund balance recovery", () => {
    it("refund restores enough balance to create a new job", async () => {
      const { enigma, company, oracle } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      expect(await enigma.balances(company.address)).to.equal(0n);

      await enigma.connect(oracle).failJob(1n, "provider down");
      await enigma.refundJob(1n);
      expect(await enigma.balances(company.address)).to.equal(PRICE);

      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      expect((await enigma.getJob(2n)).status).to.equal(Status.Pending);
    });

    it("timeout refund also restores balance for new jobs", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(1n);

      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      expect((await enigma.getJob(2n)).status).to.equal(Status.Pending);
      expect(await enigma.balances(company.address)).to.equal(0n);
    });
  });

  describe("createJobFor insufficient balance", () => {
    it("reverts when the user has zero balance", async () => {
      const { enigma, oracle, other } = await loadFixture(deploy);
      await expect(enigma.connect(oracle).createJobFor(other.address, FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });

    it("reverts when the user has balance less than the price", async () => {
      const { enigma, usdt, oracle, other } = await loadFixture(deploy);
      await usdt.mint(other.address, PRICE - 1n);
      await usdt.connect(other).approve(await enigma.getAddress(), ethers.MaxUint256);
      await enigma.connect(other).deposit(PRICE - 1n);
      await expect(enigma.connect(oracle).createJobFor(other.address, FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });

    it("debits the user's balance, not the oracle's", async () => {
      const { enigma, company, oracle } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE * 2n);
      await enigma.connect(oracle).createJobFor(company.address, FILE_HASH, EXPIRY);
      expect(await enigma.balances(company.address)).to.equal(PRICE);
      // oracle had no balance to begin with and still doesn't
    });
  });

  describe("withdraw then create", () => {
    it("withdrawing all balance blocks new jobs", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE * 2n);
      await enigma.connect(company).withdraw(PRICE * 2n);
      expect(await enigma.balances(company.address)).to.equal(0n);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });

    it("partial withdraw leaves just enough for one job", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE * 3n);
      await enigma.connect(company).withdraw(PRICE * 2n);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });

    it("cannot withdraw balance locked in pending jobs", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE * 2n);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      // 1×PRICE is locked, 1×PRICE is free
      await expect(enigma.connect(company).withdraw(PRICE + 1n))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");
      await enigma.connect(company).withdraw(PRICE); // free balance exactly
      expect(await enigma.balances(company.address)).to.equal(0n);
    });
  });

  describe("price change does not affect existing locks", () => {
    it("raising the price blocks new jobs but existing locks stay at the old price", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(deploy);
      await enigma.connect(company).deposit(PRICE * 2n);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // locked at old PRICE

      await enigma.setQueryPrice(PRICE * 10n); // 10× increase
      // free balance = PRICE, but new price = PRICE*10
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY))
        .to.be.revertedWithCustomError(enigma, "InsufficientBalance");

      // existing job still completable at the old locked price
      const sig = await signComplete(oracle, domain, 1n, company.address);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
      expect((await enigma.getJob(1n)).payment).to.equal(PRICE);
    });
  });
});
