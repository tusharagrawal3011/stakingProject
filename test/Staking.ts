import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Staking (Hardhat v3)", function () {

  async function deployFixture() {
    const [owner, user1, user2, referrer] = await ethers.getSigners();

    // Deploy mock token
    const token = await ethers.deployContract("ERC20Mock", [
      "MockToken",
      "MTK",
      owner.address,
      ethers.parseEther("1000000"),
    ]);

    // Deploy staking pool
    const pool = await ethers.deployContract("Staking", [
      await token.getAddress(),
      owner.address,
    ]) as any;

    // Distribute tokens
    await token.transfer(user1.address, ethers.parseEther("1000"));
    await token.transfer(user2.address, ethers.parseEther("1000"));
    await token.transfer(referrer.address, ethers.parseEther("1000"));

    // Approve staking pool
    await token.connect(user1).approve(await pool.getAddress(), ethers.parseEther("1000"));
    await token.connect(user2).approve(await pool.getAddress(), ethers.parseEther("1000"));
    await token.connect(referrer).approve(await pool.getAddress(), ethers.parseEther("1000"));

    // Owner funds pool for rewards
    await token.transfer(await pool.getAddress(), ethers.parseEther("500"));

    return { token, pool, owner, user1, user2, referrer };
  }

  it("should deploy correctly", async () => {
    const { pool, token } = await deployFixture();
    expect(await pool.stakingToken()).to.equal(await token.getAddress());
  });

  it("should allow staking without referrer", async () => {
    const { pool, user1, token } = await deployFixture();

    const amount = ethers.parseEther("100");
    const before = await token.balanceOf(user1.address);

    const tx = await pool.connect(user1).stake(amount);
    await expect(tx)
      .to.emit(pool, "Staked")
      .withArgs(user1.address, amount, ethers.ZeroAddress, 0n);

    const after = await token.balanceOf(user1.address);
    expect(before - after).to.equal(amount);

    const [stakedAmt] = await pool.stakeInfo(user1.address);
    expect(stakedAmt).to.equal(amount);
  });

  it("should allow staking with referrer and pay referral reward", async () => {
    const { pool, user1, referrer, token } = await deployFixture();

    const amount = ethers.parseEther("100");
    const refBefore = await token.balanceOf(referrer.address);

    const tx = await expect(
  pool.connect(user1)["stake(uint256,address)"](amount, referrer.address)
).to.emit(pool, "ReferralPaid")
  .withArgs(referrer.address, (amount * 50n) / 10000n);
    const refAfter = await token.balanceOf(referrer.address);
    const referralReward = (amount * 50n) / 10000n; // 0.5%

    expect(refAfter - refBefore).to.equal(referralReward);

    expect(await pool.referrerOf(user1.address)).to.equal(referrer.address);
  });

  it("should not reassign referrer on subsequent stakes", async () => {
    const { pool, user1, referrer } = await deployFixture();

    await pool.connect(user1)["stake(uint256,address)"](ethers.parseEther("100"), referrer.address);
    await pool.connect(user1)["stake(uint256,address)"](ethers.parseEther("100"), ethers.ZeroAddress);

    expect(await pool.referrerOf(user1.address)).to.equal(referrer.address);
  });

  it("should calculate 1% reward correctly after 1 day", async () => {
    const { pool, user1 } = await deployFixture();

    await pool.connect(user1).stake(ethers.parseEther("100"));

    // simulate time travel: increase block timestamp
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    const pending = await pool.getPendingReward(user1.address);
    expect(pending).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.0001"));
  });

  it("should allow claiming rewards after 24h", async () => {
    const { pool, user1, token } = await deployFixture();

    await pool.connect(user1).stake(ethers.parseEther("100"));
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    const before = await token.balanceOf(user1.address);
    const tx = await pool.connect(user1).claimReward();

    await expect(tx).to.emit(pool, "Claimed");

    const after = await token.balanceOf(user1.address);
    expect(after).to.be.greaterThan(before);
  });

  it("should revert if claiming before 24h", async () => {
    const { pool, user1 } = await deployFixture();

    await pool.connect(user1).stake(ethers.parseEther("100"));
    await expect(pool.connect(user1).claimReward()).to.be.revertedWith("No reward yet");
  });

  it("should allow unstake and reset user stake info", async () => {
    const { pool, user1, token } = await deployFixture();

    await pool.connect(user1).stake(ethers.parseEther("100"));
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    const before = await token.balanceOf(user1.address);
    const tx = await pool.connect(user1).unstake();

    await expect(tx)
      .to.emit(pool, "Unstaked")
      .withArgs(user1.address, ethers.parseEther("100"));

    const after = await token.balanceOf(user1.address);
    expect(after).to.be.greaterThan(before);

    const [amount] = await pool.stakeInfo(user1.address);
    expect(amount).to.equal(0n);
  });

  it("should allow owner to withdraw tokens", async () => {
    const { pool, token, owner } = await deployFixture();

    const poolBal = await token.balanceOf(await pool.getAddress());
    const withdrawAmt = ethers.parseEther("10");

    const tx = await pool.connect(owner).ownerWithdraw(await token.getAddress(), withdrawAmt);
    await expect(tx).to.emit(pool, "OwnerWithdraw");

    const poolAfter = await token.balanceOf(await pool.getAddress());
    expect(poolBal - poolAfter).to.equal(withdrawAmt);
  });
});
