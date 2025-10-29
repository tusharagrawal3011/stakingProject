import { network } from "hardhat";

const { ethers } = await network.connect();
async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Deploying contracts with:", owner.address);

  // ------------------------------------------------------------
  // 1. Deploy mock ERC20 token
  // ------------------------------------------------------------
  const Token = await ethers.getContractFactory("ERC20Mock");
  const token = await Token.deploy("MockToken", "MTK", owner.address, ethers.parseEther("1000000"));
  await token.waitForDeployment();

  console.log("MockToken deployed to:", await token.getAddress());

  // ------------------------------------------------------------
  // 2. Deploy Staking contract
  // ------------------------------------------------------------
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(await token.getAddress(), owner.address);
  await staking.waitForDeployment();

  console.log("Staking contract deployed to:", await staking.getAddress());

  // ------------------------------------------------------------
  // 3. Verify initial setup
  // ------------------------------------------------------------
  const stakingOwner = await staking.owner();
  const stakingToken = await staking.stakingToken();
  console.log("Owner:", stakingOwner);
  console.log("Token linked:", stakingToken);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
