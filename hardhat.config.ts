import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";

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
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    // ✅ Added BSC Testnet configuration
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("endpoints.omniatech.io/v1/bsc/testnet/public"),
      accounts: [configVariable("Add Private Key")],
    },
  },

};

export default config;
