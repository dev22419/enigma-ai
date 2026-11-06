// AI-assisted: Used Claude to draft the lifecycle tests
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const PRICE = 500_000n;
const TIMEOUT = 3600n;
const EXPIRY = 300;
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const FILE_HASH = h("encrypted-file");
const RESULT_HASH = h("result");
const ATTEST_HASH = h("attestation");
// Mirrors the Status enum in EnigmaAI.sol
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
  const [owner, provider, company, other, oracle, rogue] = await ethers.getSigners();
  const usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const enigma = await (await ethers.getContractFactory("EnigmaAI")).deploy(
    await usdt.getAddress(), provider.address, PRICE, TIMEOUT, owner.address
  );
  await enigma.addSigner(oracle.address);
  await usdt.mint(company.address, 100_000_000n);
  await usdt.connect(company).approve(await enigma.getAddress(), ethers.MaxUint256);
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "EnigmaAI", version: "1", chainId, verifyingContract: await enigma.getAddress() };
  return { owner, provider, company, other, oracle, rogue, usdt, enigma, domain };
}

// A company with 2.0 of credit and job 1 pending.
async function withJob() {
  const ctx = await deploy();
  await ctx.enigma.connect(ctx.company).deposit(2_000_000n);
  await ctx.enigma.connect(ctx.company).createJob(FILE_HASH, EXPIRY);
  return ctx;
}

async function processing() {
  const ctx = await withJob();
  await ctx.enigma.connect(ctx.oracle).startProcessing(1n);
  return ctx;
}

const signComplete = (signer, domain, jobId, user, resultHash = RESULT_HASH) =>
  signer.signTypedData(domain, COMPLETE, { jobId, user, fileHash: FILE_HASH, resultHash, attestationHash: ATTEST_HASH });

async function completed() {
  const ctx = await processing();
  await ctx.enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(ctx.oracle, ctx.domain, 1n, ctx.company.address));
  return ctx;
}

describe("EnigmaAI lifecycle", () => {
  describe("startProcessing", () => {
    it("moves a pending job to Processing and emits JobProcessing", async () => {
      const { enigma, oracle } = await loadFixture(withJob);
      await expect(enigma.connect(oracle).startProcessing(1n)).to.emit(enigma, "JobProcessing").withArgs(1n);
      expect((await enigma.getJob(1n)).status).to.equal(Status.Processing);
    });

    it("leaves the payment locked", async () => {
      const { enigma, usdt, company, oracle } = await loadFixture(withJob);
      const held = await usdt.balanceOf(await enigma.getAddress());
      const balance = await enigma.balances(company.address);
      await enigma.connect(oracle).startProcessing(1n);
      expect(await usdt.balanceOf(await enigma.getAddress())).to.equal(held);
      expect(await enigma.balances(company.address)).to.equal(balance);
    });

    it("is restricted to registered signers", async () => {
      const { enigma, company, other, owner } = await loadFixture(withJob);
      for (const who of [company, other, owner]) {
        await expect(enigma.connect(who).startProcessing(1n)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      }
    });

    it("works once only, and only on a pending job", async () => {
      const { enigma, oracle } = await loadFixture(processing);
      await expect(enigma.connect(oracle).startProcessing(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await expect(enigma.connect(oracle).startProcessing(99n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("is refused after the deadline", async () => {
      const { enigma, oracle } = await loadFixture(withJob);
      await time.increase(TIMEOUT + 1n);
      await expect(enigma.connect(oracle).startProcessing(1n)).to.be.revertedWithCustomError(enigma, "JobTimedOut");
    });

    it("still allows completion straight from Pending (the signer may skip the acknowledgement)", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
      expect((await enigma.getJob(1n)).status).to.equal(Status.Completed);
    });

    it("completes a Processing job and pays the provider once", async () => {
      const { enigma, usdt, provider, company, oracle, domain } = await loadFixture(processing);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
      expect((await enigma.getJob(1n)).status).to.equal(Status.Completed);
      expect(await usdt.balanceOf(provider.address)).to.equal(PRICE);
    });
  });
});
