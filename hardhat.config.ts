import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";
import "@openzeppelin/hardhat-upgrades";

import "./tasks";

import dotenv from "dotenv";
dotenv.config()

const privateKey1 = process.env.PRIVATE_KEY1!;
const privateKey2 = process.env.PRIVATE_KEY2!;

const nodeRealApiKey = process.env.NODEREAL_API_KEY!;
const bscScanApiKey = process.env.BSCSCAN_API_KEY!;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      }
    }
  },
  networks: {
    avax_fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [privateKey1, privateKey2]
    },
    bnb_testnet: {
      url: "https://data-seed-prebsc-1-s2.bnbchain.org:8545/",
      chainId: 97,
      gasPrice: 10000000000,
      accounts: [privateKey1, privateKey2]
    },
    klaytn_testnet: {
      url: "https://api.baobab.klaytn.net:8651",
      chainId: 1001,      
      accounts: [privateKey1, privateKey2]
    },
    klaytn_mainnet: {
      url: `https://open-platform.nodereal.io/${nodeRealApiKey}/klaytn/`,
      chainId: 8217,
      accounts: [privateKey1, privateKey2]    
    },
  },
  etherscan: {
    // Your API key for BSCscan
    // Obtain one at https://bscscan.com/
    //apiKey: bscScanApiKey
    apiKey: {
      avax_fuji: "snowtrace", // apiKey is not required, just set a placeholder
      bscTestnet: bscScanApiKey,
    },
    customChains: [
      {
        network: "avax_fuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://testnet.snowtrace.io"
        }
      }
    ]  
  }
};

export default config;
