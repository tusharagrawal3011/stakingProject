import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const config: HardhatUserConfig = {
  // Plugins used in Hardhat v3
  plugins: [hardhatToolboxMochaEthersPlugin],

  // Solidity compiler configuration
  solidity: {
    profiles: {
      default: {
        version: "0.8.20",
      },
      production: {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  // Network configurations
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },

    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: "https://endpoints.omniatech.io/v1/bsc/testnet/public",
      accounts: ["ACCOUNT_PRIVATE_KEY"]
    },
  },

};

export default config;
