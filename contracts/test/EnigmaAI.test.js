const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const PRICE = 500_000n; // 0.50 USDT
const TIMEOUT = 3600n;
const FILE_HASH = ethers.keccak256(ethers.toUtf8Bytes("encrypted-file"));
const RESULT_HASH = ethers.keccak256(ethers.toUtf8Bytes("result"));
const ATTEST_HASH = ethers.keccak256(ethers.toUtf8Bytes("attestation"));
const EXPIRY = 300;
// Mirrors the Status enum in EnigmaAI.sol
const Status = { None: 0n, Pending: 1n, Processing: 2n, Completed: 3n, Failed: 4n, Refunded: 5n, Expired: 6n, KeyDestroyed: 7n };

const TYPES = {
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
    await usdt.getAddress(),
    provider.address,
    PRICE,
    TIMEOUT,
    owner.address
  );
  await enigma.addSigner(oracle.address);
  await usdt.mint(company.address, 10_000_000n);
  await usdt.connect(company).approve(await enigma.getAddress(), ethers.MaxUint256);
  const { chainId } = await ethers.provider.getNetwork();
  const domain = {
    name: "EnigmaAI",
    version: "1",
    chainId,
    verifyingContract: await enigma.getAddress(),
  };
  return { owner, provider, company, other, oracle, rogue, usdt, enigma, domain };
}

async function withJob() {
  const ctx = await deploy();
  await ctx.enigma.connect(ctx.company).deposit(2_000_000n);
  await ctx.enigma.connect(ctx.company).createJob(FILE_HASH, EXPIRY);
  return ctx;
}

function sign(signer, domain, jobId, user, fileHash = FILE_HASH, resultHash = RESULT_HASH, attest = ATTEST_HASH) {
  return signer.signTypedData(domain, TYPES, {
    jobId,
    user,
    fileHash,
    resultHash,
    attestationHash: attest,
  });
}

describe("EnigmaAI", () => {
  describe("deployment", () => {
    it("sets config and rejects zero values", async () => {
      const { enigma, usdt, provider } = await loadFixture(deploy);
      expect(await enigma.usdt()).to.equal(await usdt.getAddress());
      expect(await enigma.provider()).to.equal(provider.address);
      expect(await enigma.queryPrice()).to.equal(PRICE);
      expect(await enigma.jobTimeout()).to.equal(TIMEOUT);

      const F = await ethers.getContractFactory("EnigmaAI");
      const [owner] = await ethers.getSigners();
      const z = ethers.ZeroAddress;
      await expect(F.deploy(z, owner.address, PRICE, TIMEOUT, owner.address)).to.be.revertedWithCustomError(F, "ZeroAddress");
      await expect(F.deploy(await usdt.getAddress(), z, PRICE, TIMEOUT, owner.address)).to.be.revertedWithCustomError(F, "ZeroAddress");
      await expect(F.deploy(await usdt.getAddress(), owner.address, 0, TIMEOUT, owner.address)).to.be.revertedWithCustomError(F, "ZeroAmount");
      await expect(F.deploy(await usdt.getAddress(), owner.address, PRICE, 0, owner.address)).to.be.revertedWithCustomError(F, "ZeroAmount");
    });
  });

  describe("deposit / withdraw", () => {
    it("credits balance and pulls USDT", async () => {
      const { enigma, usdt, company } = await loadFixture(deploy);
      await expect(enigma.connect(company).deposit(1_000_000n))
        .to.emit(enigma, "Deposited")
        .withArgs(company.address, 1_000_000n);
      expect(await enigma.balances(company.address)).to.equal(1_000_000n);
      expect(await usdt.balanceOf(await enigma.getAddress())).to.equal(1_000_000n);
    });

    it("rejects zero deposit and deposit without allowance", async () => {
      const { enigma, other } = await loadFixture(deploy);
      await expect(enigma.connect(other).deposit(0)).to.be.revertedWithCustomError(enigma, "ZeroAmount");
      await expect(enigma.connect(other).deposit(1)).to.be.reverted;
    });

    it("withdraws unlocked balance only", async () => {
      const { enigma, usdt, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(1_000_000n);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // locks 0.5
      await expect(enigma.connect(company).withdraw(500_001n)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
      const before = await usdt.balanceOf(company.address);
      await expect(enigma.connect(company).withdraw(500_000n)).to.emit(enigma, "Withdrawn");
      expect(await usdt.balanceOf(company.address)).to.equal(before + 500_000n);
      expect(await enigma.balances(company.address)).to.equal(0n);
      await expect(enigma.connect(company).withdraw(0)).to.be.revertedWithCustomError(enigma, "ZeroAmount");
    });
  });

  describe("createJob", () => {
    it("locks the price and stores the job", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(1_000_000n);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY))
        .to.emit(enigma, "JobCreated")
        .withArgs(1n, company.address, FILE_HASH, PRICE, EXPIRY);
      expect(await enigma.balances(company.address)).to.equal(500_000n);
      const job = await enigma.getJob(1n);
      expect(job.user).to.equal(company.address);
      expect(job.status).to.equal(Status.Pending);
      expect(job.payment).to.equal(PRICE);
      expect(job.fileHash).to.equal(FILE_HASH);
      expect(await enigma.nextJobId()).to.equal(2n);
    });

    it("reverts on insufficient balance", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
      await enigma.connect(company).deposit(PRICE - 1n);
      await expect(enigma.connect(company).createJob(FILE_HASH, EXPIRY)).to.be.revertedWithCustomError(enigma, "InsufficientBalance");
    });

    it("enforces the expiry bounds", async () => {
      const { enigma, company } = await loadFixture(deploy);
      await enigma.connect(company).deposit(2_000_000n);
      await expect(enigma.connect(company).createJob(FILE_HASH, 59)).to.be.revertedWithCustomError(enigma, "InvalidExpiry");
      await expect(enigma.connect(company).createJob(FILE_HASH, 30 * 86400 + 1)).to.be.revertedWithCustomError(enigma, "InvalidExpiry");
      await enigma.connect(company).createJob(FILE_HASH, 60);
      await enigma.connect(company).createJob(FILE_HASH, 120); // the demo's 2-minute timer
      await enigma.connect(company).createJob(FILE_HASH, 30 * 86400);
    });
  });

  describe("completeJob", () => {
    it("pays the provider and records the attestation for a valid signature", async () => {
      const { enigma, usdt, provider, company, oracle, domain } = await loadFixture(withJob);
      const sig = await sign(oracle, domain, 1n, company.address);
      const tx = await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
      const blockTime = BigInt(await time.latest());
      await expect(tx)
        .to.emit(enigma, "JobCompleted")
        .withArgs(1n, company.address, RESULT_HASH, ATTEST_HASH, oracle.address, blockTime + BigInt(EXPIRY));
      expect(await usdt.balanceOf(provider.address)).to.equal(PRICE);
      const job = await enigma.getJob(1n);
      expect(job.status).to.equal(Status.Completed);
      expect(job.resultHash).to.equal(RESULT_HASH);
      expect(job.attestationHash).to.equal(ATTEST_HASH);
      expect(job.completedAt).to.equal(blockTime);
    });

    it("can be relayed by any account", async () => {
      const { enigma, other, company, oracle, domain } = await loadFixture(withJob);
      const sig = await sign(oracle, domain, 1n, company.address);
      await enigma.connect(other).completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
    });

    it("rejects an unregistered signer", async () => {
      const { enigma, company, rogue, domain } = await loadFixture(withJob);
      const sig = await sign(rogue, domain, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("rejects a removed signer", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      await enigma.removeSigner(oracle.address);
      const sig = await sign(oracle, domain, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("rejects a signature over different result or attestation hashes", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      const sig = await sign(oracle, domain, 1n, company.address);
      const other = ethers.keccak256(ethers.toUtf8Bytes("tampered"));
      await expect(enigma.completeJob(1n, other, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      await expect(enigma.completeJob(1n, RESULT_HASH, other, sig)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("rejects a signature bound to another job (no cross-job replay)", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // job 2
      const sigForJob1 = await sign(oracle, domain, 1n, company.address);
      await expect(enigma.completeJob(2n, RESULT_HASH, ATTEST_HASH, sigForJob1)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("rejects a signature from another chain or contract domain", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      const wrongChain = await sign(oracle, { ...domain, chainId: domain.chainId + 1n }, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, wrongChain)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      const wrongContract = await sign(oracle, { ...domain, verifyingContract: oracle.address }, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, wrongContract)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("rejects a signature binding the wrong user or file hash", async () => {
      const { enigma, other, company, oracle, domain } = await loadFixture(withJob);
      const wrongUser = await sign(oracle, domain, 1n, other.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, wrongUser)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
      const wrongFile = await sign(oracle, domain, 1n, company.address, RESULT_HASH);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, wrongFile)).to.be.revertedWithCustomError(enigma, "UnauthorizedSigner");
    });

    it("allows only one completion per job", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      const sig = await sign(oracle, domain, 1n, company.address);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("rejects unknown jobs and malformed signatures", async () => {
      const { enigma } = await loadFixture(withJob);
      await expect(enigma.completeJob(99n, RESULT_HASH, ATTEST_HASH, "0x")).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, "0x1234")).to.be.revertedWithCustomError(enigma, "ECDSAInvalidSignatureLength");
    });

    it("rejects completion after the timeout", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      await time.increase(TIMEOUT + 1n);
      const sig = await sign(oracle, domain, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "JobTimedOut");
    });
  });

  describe("refundJob", () => {
    it("is blocked before the timeout", async () => {
      const { enigma } = await loadFixture(withJob);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "JobNotTimedOut");
    });

    it("returns the locked payment to the user's balance after the timeout", async () => {
      const { enigma, company, other } = await loadFixture(withJob);
      await time.increase(TIMEOUT + 1n);
      await expect(enigma.connect(other).refundJob(1n)).to.emit(enigma, "JobRefunded").withArgs(1n, company.address, PRICE);
      expect(await enigma.balances(company.address)).to.equal(2_000_000n);
      expect((await enigma.getJob(1n)).status).to.equal(Status.Refunded);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("cannot refund a completed job", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      const sig = await sign(oracle, domain, 1n, company.address);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
      await time.increase(TIMEOUT + 1n);
      await expect(enigma.refundJob(1n)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });

    it("cannot complete a refunded job", async () => {
      const { enigma, company, oracle, domain } = await loadFixture(withJob);
      await time.increase(TIMEOUT + 1n);
      await enigma.refundJob(1n);
      const sig = await sign(oracle, domain, 1n, company.address);
      await expect(enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig)).to.be.revertedWithCustomError(enigma, "InvalidJobStatus");
    });
  });

  describe("admin", () => {
    it("restricts admin functions to the owner", async () => {
      const { enigma, other } = await loadFixture(deploy);
      const e = enigma.connect(other);
      for (const call of [
        () => e.addSigner(other.address),
        () => e.removeSigner(other.address),
        () => e.setProvider(other.address),
        () => e.setQueryPrice(1),
        () => e.setJobTimeout(1),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(enigma, "OwnableUnauthorizedAccount");
      }
    });

    it("manages the signer registry", async () => {
      const { enigma, other } = await loadFixture(deploy);
      await expect(enigma.addSigner(other.address)).to.emit(enigma, "SignerAdded").withArgs(other.address);
      expect(await enigma.isSigner(other.address)).to.equal(true);
      await expect(enigma.addSigner(other.address)).to.be.revertedWithCustomError(enigma, "SignerAlreadyRegistered");
      await expect(enigma.addSigner(ethers.ZeroAddress)).to.be.revertedWithCustomError(enigma, "ZeroAddress");
      await expect(enigma.removeSigner(other.address)).to.emit(enigma, "SignerRemoved").withArgs(other.address);
      await expect(enigma.removeSigner(other.address)).to.be.revertedWithCustomError(enigma, "SignerNotRegistered");
    });

    it("updates settings; a price change does not affect locked jobs", async () => {
      const { enigma, provider, other, company, oracle, usdt, domain } = await loadFixture(withJob);
      await enigma.setQueryPrice(1_000_000n);
      await enigma.setProvider(other.address);
      await enigma.setJobTimeout(7200);
      expect(await enigma.queryPrice()).to.equal(1_000_000n);
      expect(await enigma.provider()).to.equal(other.address);
      expect(await enigma.jobTimeout()).to.equal(7200n);
      await expect(enigma.setQueryPrice(0)).to.be.revertedWithCustomError(enigma, "ZeroAmount");
      await expect(enigma.setProvider(ethers.ZeroAddress)).to.be.revertedWithCustomError(enigma, "ZeroAddress");
      await expect(enigma.setJobTimeout(0)).to.be.revertedWithCustomError(enigma, "ZeroAmount");

      const sig = await sign(oracle, domain, 1n, company.address);
      await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
      expect(await usdt.balanceOf(other.address)).to.equal(PRICE); // old locked price, new provider
      expect(await usdt.balanceOf(provider.address)).to.equal(0n);
    });
  });

  it("keeps each job's deadline when the owner changes the timeout", async () => {
    const { enigma, company, oracle, domain } = await loadFixture(withJob);
    await enigma.setJobTimeout(10); // shrink: job 1 must still be completable
    await time.increase(100);
    const sig = await sign(oracle, domain, 1n, company.address);
    await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);

    await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // job 2, 10s deadline
    await enigma.setJobTimeout(86400); // grow: job 2 must still be refundable after 10s
    await time.increase(11);
    await enigma.refundJob(2n);
  });

  it("keeps the contract's USDT equal to balances plus pending locks", async () => {
    const { enigma, usdt, company, oracle, domain } = await loadFixture(deploy);
    await enigma.connect(company).deposit(2_000_000n);
    await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // 1: will complete
    await enigma.connect(company).createJob(FILE_HASH, EXPIRY); // 2: stays pending
    const sig = await sign(oracle, domain, 1n, company.address);
    await enigma.completeJob(1n, RESULT_HASH, ATTEST_HASH, sig);
    const held = await usdt.balanceOf(await enigma.getAddress());
    expect(held).to.equal((await enigma.balances(company.address)) + PRICE); // free balance + job 2 lock
  });
});
