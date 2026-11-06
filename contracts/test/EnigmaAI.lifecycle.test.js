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

  describe("failJob", () => {
    it("fails a Processing job and emits the reason", async () => {
      const { enigma, oracle } = await loadFixture(processing);
      await expect(enigma.connect(oracle).failJob(1n, "provider timeout")).to.emit(enigma, "JobFailed").withArgs(1n, "provider timeout");
      expect((await enigma.getJob(1n)).status).to.equal(Status.Failed);
    });

    it("also fails a Pending job (the backend can give up before acknowledging)", async () => {
      const { enigma, oracle } = await loadFixture(withJob);
      await enigma.connect(oracle).failJob(1n, "misconfigured");
      expect((await enigma.getJob(1n)).status).to.equal(Status.Failed);
    });

    it("is restricted to registered signers", async () => {
      const { enigma, company, other, owner } = await loadFixture(processing);
      for (const who of [company, other, owner]) {
        await expect(enigma.connect(who).failJob(1n, "x")).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      }
    });

    it("cannot fail a completed, failed, refunded or unknown job", async () => {
      const { enigma, oracle } = await loadFixture(completed);
      await expect(enigma.connect(oracle).failJob(1n, "late")).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await expect(enigma.connect(oracle).failJob(99n, "none")).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");

      const ctx = await loadFixture(withJob);
      await ctx.enigma.connect(ctx.oracle).failJob(1n, "once");
      await expect(ctx.enigma.connect(ctx.oracle).failJob(1n, "twice")).to.be.revertedWithCustomError(ctx.enigma, "InvalidJobStatus");
    });

    it("caps the public reason at 128 bytes", async () => {
      const { enigma, oracle } = await loadFixture(processing);
      await expect(enigma.connect(oracle).failJob(1n, "x".repeat(129))).to.be.revertedWithCustomError(enigma, "ReasonTooLong");
      await enigma.connect(oracle).failJob(1n, "x".repeat(128));
    });

    it("blocks completion afterwards, even with a valid signature", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(processing);
      await enigma.connect(oracle).failJob(1n, "gave up");
      const sig = await signComplete(oracle, domain, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });
  });

  describe("refundJob", () => {
    it("refunds a Failed job immediately, to the user's balance, and only once", async () => {
      const { enigma, company, other, oracle } = await loadFixture(processing);
      await enigma.connect(oracle).failJob(1n, "provider timeout");
      const before = await enigma.balances(company.address);
      await expect(enigma.connect(other).refundJob(1n)).to.emit(enigma, "JobRefunded").withArgs(1n, company.address, PRICE);
      expect(await enigma.balances(company.address)).to.equal(before + PRICE);
      expect((await enigma.getJob(1n)).status).to.equal(Status.Refunded);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("refunds a Processing job only after the deadline (no funds locked by a vanished signer)", async () => {
      const { enigma, company } = await loadFixture(processing);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "JobNotTimedOut");
      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(1n);
      expect(await enigma.balances(company.address)).to.equal(2_000_000n);
      expect((await enigma.getJob(1n)).status).to.equal(Status.Refunded);
    });

    it("still refunds a Pending job only after the deadline", async () => {
      const { enigma } = await loadFixture(withJob);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "JobNotTimedOut");
      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(1n);
    });

    it("refuses a Completed job and an unknown job", async () => {
      const { enigma } = await loadFixture(completed);
      await time.increase(TIMEOUT + 1n);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await expect(enigma.refundJob(99n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("cannot complete a job after it was refunded", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(processing);
      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(1n);
      const sig = await signComplete(oracle, domain, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("pays out or refunds a job, never both", async () => {
      const { enigma, usdt, provider, company, oracle } = await loadFixture(processing);
      await enigma.connect(oracle).failJob(1n, "failed");
      await enigma.refundJob(1n);
      expect(await usdt.balanceOf(provider.address)).to.equal(0n);
      expect(await enigma.balances(company.address)).to.equal(2_000_000n);
    });
  });

  describe("markExpired", () => {
    it("is refused while the result is still alive", async () => {
      const { enigma } = await loadFixture(completed);
      await expect(enigma.markExpired(1n)).to.be.revertedWithCustomError(enigma, "JobNotExpired");
    });

    it("moves a completed job to Expired at exactly completedAt + expirySeconds, for anyone", async () => {
      const { enigma, other } = await loadFixture(completed);
      const job = await enigma.getJob(1n);
      const expiresAt = job.completedAt + job.expirySeconds;
      await time.setNextBlockTimestamp(expiresAt - 1n);
      await expect(enigma.connect(other).markExpired(1n, { gasLimit: 300_000 })).to.be.revertedWithCustomError(enigma, "JobNotExpired");
      await time.setNextBlockTimestamp(expiresAt);
      await expect(enigma.connect(other).markExpired(1n)).to.emit(enigma, "JobExpired").withArgs(1n);
      expect((await enigma.getJob(1n)).status).to.equal(Status.Expired);
    });

    it("works once, and only on completed jobs", async () => {
      const { enigma } = await loadFixture(completed);
      await time.increase(EXPIRY);
      await enigma.markExpired(1n);
      await expect(enigma.markExpired(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");

      const pending = await loadFixture(withJob);
      await time.increase(TIMEOUT + 1n);
      await expect(pending.enigma.markExpired(1n)).to.be.revertedWithCustomError(pending.enigma, "InvalidJobStatus");
      await expect(pending.enigma.markExpired(99n)).to.be.revertedWithCustomError(pending.enigma, "InvalidJobStatus");
    });

    it("never touches funds, and an Expired job can no longer be refunded", async () => {
      const { enigma, usdt, company } = await loadFixture(completed);
      const held = await usdt.balanceOf(await enigma.getAddress());
      const credit = await enigma.balances(company.address);
      await time.increase(EXPIRY);
      await enigma.markExpired(1n);
      expect(await usdt.balanceOf(await enigma.getAddress())).to.equal(held);
      expect(await enigma.balances(company.address)).to.equal(credit);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });
  });

  describe("markKeyDestroyed", () => {
    const RECEIPT = h("destruction-receipt");

    it("records the receipt hash for an Expired job and emits JobKeyDestroyed", async () => {
      const { enigma, oracle } = await loadFixture(completed);
      await time.increase(EXPIRY);
      await enigma.markExpired(1n);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT)).to.emit(enigma, "JobKeyDestroyed").withArgs(1n, RECEIPT);
      expect((await enigma.getJob(1n)).status).to.equal(Status.KeyDestroyed);
      expect(await enigma.keyDestructionReceipt(1n)).to.equal(RECEIPT);
    });

    it("moves a completed job past its lifetime through Expired in one call, emitting both events", async () => {
      const { enigma, oracle } = await loadFixture(completed);
      await time.increase(EXPIRY);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT))
        .to.emit(enigma, "JobExpired").withArgs(1n)
        .and.to.emit(enigma, "JobKeyDestroyed").withArgs(1n, RECEIPT);
      expect((await enigma.getJob(1n)).status).to.equal(Status.KeyDestroyed);
    });

    it("refuses to attest destruction while the result is still alive", async () => {
      const { enigma, oracle } = await loadFixture(completed);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT)).to.be.revertedWithCustomError(enigma, "JobNotExpired");
      expect(await enigma.keyDestructionReceipt(1n)).to.equal(ethers.ZeroHash);
    });

    it("is restricted to registered signers", async () => {
      const { enigma, company, other, owner } = await loadFixture(completed);
      await time.increase(EXPIRY);
      for (const who of [company, other, owner]) {
        await expect(enigma.connect(who).markKeyDestroyed(1n, RECEIPT)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      }
    });

    it("rejects an empty receipt hash, so the flag always carries evidence", async () => {
      const { enigma, oracle } = await loadFixture(completed);
      await time.increase(EXPIRY);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, ethers.ZeroHash)).to.be.revertedWithCustomError(enigma, "InvalidReceipt");
    });

    it("records once only, and the first receipt cannot be overwritten", async () => {
      const { enigma, oracle } = await loadFixture(completed);
      await time.increase(EXPIRY);
      await enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, h("other"))).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      expect(await enigma.keyDestructionReceipt(1n)).to.equal(RECEIPT);
    });

    it("applies only to completed jobs, never to pending, processing, failed, refunded or unknown ones", async () => {
      const { enigma, oracle } = await loadFixture(withJob);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await enigma.connect(oracle).startProcessing(1n);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await enigma.connect(oracle).failJob(1n, "x");
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await enigma.refundJob(1n);
      await expect(enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await expect(enigma.connect(oracle).markKeyDestroyed(99n, RECEIPT)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("leaves a KeyDestroyed job unrefundable and its funds untouched", async () => {
      const { enigma, usdt, provider, oracle } = await loadFixture(completed);
      await time.increase(EXPIRY);
      await enigma.connect(oracle).markKeyDestroyed(1n, RECEIPT);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      expect(await usdt.balanceOf(provider.address)).to.equal(PRICE);
    });
  });

  describe("whole lifecycle", () => {
    it("walks the happy path in order: Pending, Processing, Completed, Expired, KeyDestroyed", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      const seen = [(await enigma.getJob(1n)).status];
      await enigma.connect(oracle).startProcessing(1n);
      seen.push((await enigma.getJob(1n)).status);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
      seen.push((await enigma.getJob(1n)).status);
      await time.increase(EXPIRY);
      await enigma.markExpired(1n);
      seen.push((await enigma.getJob(1n)).status);
      await enigma.connect(oracle).markKeyDestroyed(1n, h("receipt"));
      seen.push((await enigma.getJob(1n)).status);
      expect(seen).to.deep.equal([Status.Pending, Status.Processing, Status.Completed, Status.Expired, Status.KeyDestroyed]);
    });

    it("walks the failure path in order: Pending, Processing, Failed, Refunded", async () => {
      const { enigma, oracle } = await loadFixture(withJob);
      const seen = [(await enigma.getJob(1n)).status];
      await enigma.connect(oracle).startProcessing(1n);
      seen.push((await enigma.getJob(1n)).status);
      await enigma.connect(oracle).failJob(1n, "provider timeout");
      seen.push((await enigma.getJob(1n)).status);
      await enigma.refundJob(1n);
      seen.push((await enigma.getJob(1n)).status);
      expect(seen).to.deep.equal([Status.Pending, Status.Processing, Status.Failed, Status.Refunded]);
    });

    it("keeps each job's state independent", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // job 2
      await enigma.connect(oracle).startProcessing(2n);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
      expect((await enigma.getJob(1n)).status).to.equal(Status.Completed);
      expect((await enigma.getJob(2n)).status).to.equal(Status.Processing);
    });

    it("keeps the contract's USDT equal to balances plus unreleased locks in every state", async () => {
      const { enigma, usdt, company, oracle, domain } = await loadFixture(deploy);
      const addr = await enigma.getAddress();
      const solvent = async (locked) =>
        expect(await usdt.balanceOf(addr)).to.equal((await enigma.balances(company.address)) + locked);

      await enigma.connect(company).deposit(PRICE * 6n);
      for (let i = 0; i < 5; i++) await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // jobs 1-5
      await solvent(PRICE * 5n);

      await enigma.connect(oracle).startProcessing(1n);
      await enigma.connect(oracle).startProcessing(2n);
      await enigma.connect(oracle).startProcessing(3n);
      await solvent(PRICE * 5n);

      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
      await solvent(PRICE * 4n);
      await enigma.connect(oracle).failJob(2n, "failed");
      await enigma.refundJob(2n);
      await solvent(PRICE * 3n);

      await time.increase(EXPIRY);
      await enigma.markExpired(1n);
      await enigma.connect(oracle).markKeyDestroyed(1n, h("receipt"));
      await solvent(PRICE * 3n); // expiry and destruction never move money

      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(3n); // Processing past the deadline
      await enigma.refundJob(4n); // Pending past the deadline
      await enigma.refundJob(5n);
      await solvent(0n);

      await enigma.connect(company).withdraw(await enigma.balances(company.address));
      expect(await usdt.balanceOf(addr)).to.equal(0n);
    });
  });
});
