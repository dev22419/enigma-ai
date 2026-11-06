// AI-assisted: Used Claude to draft the lifecycle and edge-case tests
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
const RECEIPT_HASH = h("destruction-receipt");

// Phase enum order in EnigmaAI.sol
const Phase = { None: 0n, Processing: 1n, Completed: 2n, Expired: 3n, KeyDestroyed: 4n, Failed: 5n, Refunded: 6n };

const COMPLETE = {
  Complete: [
    { name: "jobId", type: "uint256" },
    { name: "user", type: "address" },
    { name: "fileHash", type: "bytes32" },
    { name: "resultHash", type: "bytes32" },
    { name: "attestationHash", type: "bytes32" },
  ],
};
const DESTROY = {
  Destroy: [
    { name: "jobId", type: "uint256" },
    { name: "user", type: "address" },
    { name: "resultHash", type: "bytes32" },
    { name: "receiptHash", type: "bytes32" },
    { name: "destroyedAt", type: "uint64" },
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

async function withJob() {
  const ctx = await deploy();
  await ctx.enigma.connect(ctx.company).deposit(2_000_000n);
  await ctx.enigma.connect(ctx.company).createJob(FILE_HASH, EXPIRY);
  return ctx;
}

async function completed() {
  const ctx = await withJob();
  const sig = await ctx.oracle.signTypedData(ctx.domain, COMPLETE, {
    jobId: 1n, user: ctx.company.address, fileHash: FILE_HASH, resultHash: RESULT_HASH, attestationHash: ATTEST_HASH,
  });
  await ctx.enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
  return ctx;
}

const signComplete = (signer, domain, jobId, user, resultHash = RESULT_HASH) =>
  signer.signTypedData(domain, COMPLETE, { jobId, user, fileHash: FILE_HASH, resultHash, attestationHash: ATTEST_HASH });

async function signDestroy(signer, domain, jobId, user, receipt = RECEIPT_HASH, destroyedAt, resultHash = RESULT_HASH) {
  destroyedAt = destroyedAt ?? BigInt(await time.latest());
  const sig = await signer.signTypedData(domain, DESTROY, { jobId, user, resultHash, receiptHash: receipt, destroyedAt });
  return { sig, destroyedAt };
}

describe("EnigmaAI lifecycle", () => {
  describe("phaseOf", () => {
    it("is None for a job that does not exist", async () => {
      const { enigma } = await loadFixture(deploy);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.None);
      expect(await enigma.phaseOf(ethers.MaxUint256)).to.equal(Phase.None);
    });

    it("walks Processing -> Failed -> Refunded for a job nobody completes", async () => {
      const { enigma, other } = await loadFixture(withJob);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Processing);
      await time.increase(TIMEOUT + 1n);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Failed);
      await enigma.connect(other).refundJob(1n);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Refunded);
    });

    it("walks Completed -> Expired -> KeyDestroyed on the happy path", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(completed);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Completed);

      await time.increase(EXPIRY);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Expired);

      const { sig, destroyedAt } = await signDestroy(oracle, domain, 1n, company.address);
      await enigma.recordKeyDestruction(1n, RECEIPT_HASH, destroyedAt, sig);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.KeyDestroyed);
    });

    it("flips from Processing to Failed exactly after the deadline, not at it", async () => {
      const { enigma } = await loadFixture(withJob);
      const deadline = (await enigma.getJob(1n)).deadline;
      await time.setNextBlockTimestamp(deadline);
      await ethers.provider.send("evm_mine", []);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Processing);
      await time.setNextBlockTimestamp(deadline + 1n);
      await ethers.provider.send("evm_mine", []);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Failed);
    });

    it("tracks each job independently", async () => {
      const { enigma, company } = await loadFixture(completed);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
      expect(await enigma.phaseOf(1n)).to.equal(Phase.Completed);
      expect(await enigma.phaseOf(2n)).to.equal(Phase.Processing);
    });
  });

  describe("recordKeyDestruction", () => {
    it("stores the attestation and emits KeyDestroyed", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(completed);
      await time.increase(EXPIRY);
      const { sig, destroyedAt } = await signDestroy(oracle, domain, 1n, company.address);
      const tx = await enigma.recordKeyDestruction(1n, RECEIPT_HASH, destroyedAt, sig);
      await expect(tx).to.emit(enigma, "KeyDestroyed").withArgs(1n, company.address, RECEIPT_HASH, destroyedAt, oracle.address);
      const d = await enigma.getDestruction(1n);
      expect(d.receiptHash).to.equal(RECEIPT_HASH);
      expect(d.destroyedAt).to.equal(destroyedAt);
      expect(d.recordedAt).to.equal(BigInt(await time.latest()));
      expect(d.signer).to.equal(oracle.address);
    });

    it("returns an empty record for jobs with no destruction", async () => {
      const { enigma } = await loadFixture(completed);
      const d = await enigma.getDestruction(1n);
      expect(d.signer).to.equal(ethers.ZeroAddress);
      expect(d.receiptHash).to.equal(ethers.ZeroHash);
    });

    it("can be relayed by any account", async () => {
      const { enigma, other, company, oracle, domain } = await loadFixture(completed);
      const { sig, destroyedAt } = await signDestroy(oracle, domain, 1n, company.address);
      await enigma.connect(other).recordKeyDestruction(1n, RECEIPT_HASH, destroyedAt, sig);
    });

    it("does not move funds or change the job's stored status", async () => {
      const { enigma, usdt, company, oracle, domain } = await loadFixture(completed);
      const heldBefore = await usdt.balanceOf(await enigma.getAddress());
      const balBefore = await enigma.balances(company.address);
      const { sig, destroyedAt } = await signDestroy(oracle, domain, 1n, company.address);
      await enigma.recordKeyDestruction(1n, RECEIPT_HASH, destroyedAt, sig);
      expect(await usdt.balanceOf(await enigma.getAddress())).to.equal(heldBefore);
      expect(await enigma.balances(company.address)).to.equal(balBefore);
      expect((await enigma.getJob(1n)).status).to.equal(2n); // still Completed
    });

    it("rejects a job that is not completed (pending, refunded, unknown)", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      const { sig, destroyedAt } = await signDestroy(oracle, domain, 1n, company.address);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, destroyedAt, sig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");

      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(1n);
      const again = await signDestroy(oracle, domain, 1n, company.address);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, again.destroyedAt, again.sig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");

      await expect(enigma.recordKeyDestruction(99n, RECEIPT_HASH, destroyedAt, "0x")).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("records only once per job, even with a fresh valid signature", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(completed);
      const first = await signDestroy(oracle, domain, 1n, company.address);
      await enigma.recordKeyDestruction(1n, RECEIPT_HASH, first.destroyedAt, first.sig);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, first.destroyedAt, first.sig)).to.be.revertedWithCustomError(enigma, "AlreadyDestroyed");
      const other = h("a different receipt");
      const second = await signDestroy(oracle, domain, 1n, company.address, other);
      await expect(enigma.recordKeyDestruction(1n, other, second.destroyedAt, second.sig)).to.be.revertedWithCustomError(enigma, "AlreadyDestroyed");
      expect((await enigma.getDestruction(1n)).receiptHash).to.equal(RECEIPT_HASH);
    });

    it("rejects a destruction time in the future but accepts the current block time", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(completed);
      const future = BigInt(await time.latest()) + 1000n;
      const bad = await signDestroy(oracle, domain, 1n, company.address, RECEIPT_HASH, future);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, future, bad.sig)).to.be.revertedWithCustomError(enigma, "InvalidDestroyTime");

      const next = BigInt(await time.latest()) + 5n;
      const ok = await signDestroy(oracle, domain, 1n, company.address, RECEIPT_HASH, next);
      await time.setNextBlockTimestamp(next); // block time == destroyedAt is allowed
      await enigma.recordKeyDestruction(1n, RECEIPT_HASH, next, ok.sig);
    });

    it("rejects an unregistered or removed signer", async () => {
      const { enigma, company, oracle, rogue, domain } = await loadFixture(completed);
      const bad = await signDestroy(rogue, domain, 1n, company.address);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, bad.destroyedAt, bad.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");

      await enigma.removeSigner(oracle.address);
      const removed = await signDestroy(oracle, domain, 1n, company.address);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, removed.destroyedAt, removed.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("binds the signature to job, user, result, receipt, time and domain", async () => {
      const { enigma, company, other, oracle, domain } = await loadFixture(completed);
      await enigma.connect(company).deposit(PRICE);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // job 2 (pending)
      const good = await signDestroy(oracle, domain, 1n, company.address);
      const call = (receipt, at, sig) => enigma.recordKeyDestruction(1n, receipt, at, sig);

      await expect(call(h("tampered"), good.destroyedAt, good.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      await expect(call(RECEIPT_HASH, good.destroyedAt - 1n, good.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");

      const wrongJob = await signDestroy(oracle, domain, 2n, company.address);
      await expect(call(RECEIPT_HASH, wrongJob.destroyedAt, wrongJob.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      const wrongUser = await signDestroy(oracle, domain, 1n, other.address);
      await expect(call(RECEIPT_HASH, wrongUser.destroyedAt, wrongUser.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      const wrongResult = await signDestroy(oracle, domain, 1n, company.address, RECEIPT_HASH, undefined, h("other result"));
      await expect(call(RECEIPT_HASH, wrongResult.destroyedAt, wrongResult.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");

      const chain = await signDestroy(oracle, { ...domain, chainId: domain.chainId + 1n }, 1n, company.address);
      await expect(call(RECEIPT_HASH, chain.destroyedAt, chain.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      const contract = await signDestroy(oracle, { ...domain, verifyingContract: oracle.address }, 1n, company.address);
      await expect(call(RECEIPT_HASH, contract.destroyedAt, contract.sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("does not accept a completion signature as a destruction signature (type separation)", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(completed);
      const sig = await signComplete(oracle, domain, 1n, company.address);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, 1n, sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("rejects malformed signatures", async () => {
      const { enigma } = await loadFixture(completed);
      await expect(enigma.recordKeyDestruction(1n, RECEIPT_HASH, 1n, "0x1234")).to.be.revertedWithCustomError(enigma, "ECDSAInvalidSignatureLength");
    });
  });

  describe("ownership (two-step)", () => {
    it("needs the new owner to accept before admin rights move", async () => {
      const { enigma, owner, other } = await loadFixture(deploy);
      await enigma.transferOwnership(other.address);
      expect(await enigma.owner()).to.equal(owner.address);
      expect(await enigma.pendingOwner()).to.equal(other.address);
      await expect(enigma.connect(other).addSigner(other.address)).to.be.revertedWithCustomError(enigma, "OwnableUnauthorizedAccount");
      await enigma.connect(other).acceptOwnership();
      expect(await enigma.owner()).to.equal(other.address);
      await expect(enigma.addSigner(owner.address)).to.be.revertedWithCustomError(enigma, "OwnableUnauthorizedAccount");
    });

    it("lets only the pending owner accept", async () => {
      const { enigma, other, rogue } = await loadFixture(deploy);
      await enigma.transferOwnership(other.address);
      await expect(enigma.connect(rogue).acceptOwnership()).to.be.revertedWithCustomError(enigma, "OwnableUnauthorizedAccount");
    });
  });
});

describe("EnigmaAI credit edge cases", () => {
  it("allows a job when the balance equals the price exactly, leaving zero", async () => {
    const { enigma, company } = await loadFixture(deploy);
    await enigma.connect(company).deposit(PRICE);
    await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
    expect(await enigma.balances(company.address)).to.equal(0n);
    await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
  });

  it("funds exactly N jobs from N prices and rejects job N+1", async () => {
    const { enigma, company } = await loadFixture(deploy);
    await enigma.connect(company).deposit(PRICE * 3n + 1n);
    for (let i = 0; i < 3; i++) await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
    expect(await enigma.balances(company.address)).to.equal(1n);
    await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
  });

  it("does not let one company spend another's credits", async () => {
    const { enigma, usdt, company, other } = await loadFixture(deploy);
    await enigma.connect(company).deposit(PRICE * 2n);
    await expect(enigma.connect(other).createJob(FILE_HASH, EXPIRY)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    await expect(enigma.connect(other).withdraw(1n)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    expect(await enigma.balances(company.address)).to.equal(PRICE * 2n);
    expect(await usdt.balanceOf(await enigma.getAddress())).to.equal(PRICE * 2n);
  });

  it("applies a raised price to new jobs only, and the insufficient check follows it", async () => {
    const { enigma, company } = await loadFixture(deploy);
    await enigma.connect(company).deposit(PRICE * 2n);
    await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // locks 0.5
    await enigma.setQueryPrice(PRICE * 2n); // 1.0; the remaining 0.5 is now too little
    await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    expect((await enigma.getJob(1n)).payment).to.equal(PRICE);
  });

  it("makes refunded credit spendable and withdrawable again", async () => {
    const { enigma, usdt, company, other } = await loadFixture(deploy);
    await enigma.connect(company).deposit(PRICE);
    await enigma.connect(company).createJob(FILE_HASH, EXPIRY);
    await expect(enigma.connect(company).withdraw(1n)).to.be.revertedWithCustomError(enigma, "InsufficientBalance"); // locked
    await time.increase(TIMEOUT + 1n);
    await enigma.connect(other).refundJob(1n);
    await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // spendable again
    await time.increase(TIMEOUT + 1n);
    await enigma.refundJob(2n);
    const before = await usdt.balanceOf(company.address);
    await enigma.connect(company).withdraw(PRICE);
    expect(await usdt.balanceOf(company.address)).to.equal(before + PRICE);
  });

  it("rejects a second completion even with a fresh valid signature over a different result", async () => {
    const { enigma, usdt, provider, company, oracle, domain } = await loadFixture(withJob);
    await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
    const altResult = h("another result");
    const altSig = await signComplete(oracle, domain, 1n, company.address, altResult);
    await expect(enigma.completeJob(1n, altResult, ATTEST_HASH, altSig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    expect(await usdt.balanceOf(provider.address)).to.equal(PRICE); // paid once
    expect((await enigma.getJob(1n)).resultHash).to.equal(RESULT_HASH);
  });

  it("allows completion at the exact deadline", async () => {
    const { enigma, company, oracle, domain } = await loadFixture(withJob);
    const deadline = (await enigma.getJob(1n)).deadline;
    const sig = await signComplete(oracle, domain, 1n, company.address);
    await time.setNextBlockTimestamp(deadline);
    await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
    expect((await enigma.getJob(1n)).status).to.equal(2n);
  });

  it("opens refunds only strictly after the deadline", async () => {
    const { enigma, company } = await loadFixture(withJob);
    const deadline = (await enigma.getJob(1n)).deadline;
    await time.setNextBlockTimestamp(deadline);
    // an explicit gas limit makes the node mine the reverting tx at exactly the deadline
    await expect(enigma.refundJob(1n, { gasLimit: 300_000 })).to.be.revertedWithCustomError(enigma, "JobNotTimedOut");
    await time.setNextBlockTimestamp(deadline + 1n);
    await expect(enigma.refundJob(1n)).to.emit(enigma, "JobRefunded").withArgs(1n, company.address, PRICE);
  });

  it("rejects deposits the sender cannot fund", async () => {
    const { enigma, usdt, rogue } = await loadFixture(deploy);
    await usdt.mint(rogue.address, 100n);
    await expect(enigma.connect(rogue).deposit(100n)).to.be.reverted; // no allowance
    await usdt.connect(rogue).approve(await enigma.getAddress(), 1000n);
    await expect(enigma.connect(rogue).deposit(101n)).to.be.reverted; // allowance but not enough tokens
    expect(await enigma.balances(rogue.address)).to.equal(0n);
  });

  it("stays solvent across a mixed sequence of deposits, jobs, completions, refunds and withdrawals", async () => {
    const { enigma, usdt, company, oracle, domain } = await loadFixture(deploy);
    const addr = await enigma.getAddress();
    const solvent = async (locked) => {
      expect(await usdt.balanceOf(addr)).to.equal((await enigma.balances(company.address)) + locked);
    };

    await enigma.connect(company).deposit(PRICE * 5n);
    for (let i = 0; i < 4; i++) await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // jobs 1-4
    await solvent(PRICE * 4n);

    await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 1n, company.address));
    await solvent(PRICE * 3n);
    await enigma.completeJob(2n, RESULT_HASH, ATTEST_HASH, await signComplete(oracle, domain, 2n, company.address));
    await solvent(PRICE * 2n);

    await enigma.connect(company).withdraw(PRICE); // the one unlocked price
    await solvent(PRICE * 2n);

    await time.increase(TIMEOUT + 1n);
    await enigma.refundJob(3n);
    await solvent(PRICE);
    await enigma.refundJob(4n);
    await solvent(0n);

    await enigma.connect(company).withdraw(PRICE * 2n);
    await solvent(0n);
    expect(await usdt.balanceOf(addr)).to.equal(0n);
  });
});
