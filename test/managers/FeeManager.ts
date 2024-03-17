import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {  
  ProtocolAction
} from "../helpers/utils";

const WRITE_FEE = "0.001";
const DERIVE_FEE = "0.003";
const DERIVE_WILDCARD_FEE = "0.01";
const CLAIM_ROYALTY_FEE = "0.005";

describe("FeeManager", function(){
  // fixtures
  async function deployFixture() {
    const { feeManager } = await loadFixture(deployManager);

    await feeManager.setFee(ProtocolAction.WRITE, ethers.parseEther(WRITE_FEE));
    await feeManager.setFee(ProtocolAction.DERIVE, ethers.parseEther(DERIVE_FEE));
    await feeManager.setFee(ProtocolAction.DERIVE_WILDCARD, ethers.parseEther(DERIVE_WILDCARD_FEE));
    await feeManager.setFee(ProtocolAction.CLAIM_DERIVED_ROYALTY, ethers.parseEther(CLAIM_ROYALTY_FEE));

    return { feeManager };
  }
  async function deployManager() {
    const FeeManagerContract = await ethers.getContractFactory("FeeManager");
    const deployManager = await upgrades.deployProxy(FeeManagerContract, []);
    await deployManager.waitForDeployment();

    const feeManager = await ethers.getContractAt("FeeManager", deployManager.target); 

    return { feeManager };
  }

  describe("Deployment", function(){
    it("Should deploy successfully", async function(){
      const { feeManager } = await loadFixture(deployManager);
      expect(await feeManager.getAddress()).to.be.properAddress;
    });
  })

  describe("Fee", function(){
    it("Should set fee failed due to unauthorized", async function(){
      const [owner, account2, account3] = await ethers.getSigners();
      const { feeManager } = await loadFixture(deployManager);

      await expect(feeManager.connect(account2).setFee(ProtocolAction.WRITE, ethers.parseEther(WRITE_FEE)))
              .to.be.reverted;
    });

    it("Should set fee failed due to zero value", async function(){
      const [owner, account2, account3] = await ethers.getSigners();
      const { feeManager } = await loadFixture(deployManager);

      await expect(feeManager.setFee(ProtocolAction.WRITE, 0))
              .to.be.revertedWith("Fee MUST be greater than zero");
    });

    it("Should set fee successfully", async function(){
      const { feeManager } = await loadFixture(deployManager);      

      await expect(feeManager.setFee(ProtocolAction.WRITE, ethers.parseEther(WRITE_FEE)))
              .to.not.reverted;
    });

    it("Should set fee emit event properly", async function(){
      const { feeManager } = await loadFixture(deployManager);      

      await expect(feeManager.setFee(ProtocolAction.WRITE, ethers.parseEther(WRITE_FEE)))
              .to.emit(feeManager, "SetFee")
              .withArgs(ProtocolAction.WRITE, ethers.parseEther(WRITE_FEE));
    });

    it("Should lookup fee properly", async function(){
      const { feeManager } = await loadFixture(deployFixture);

      expect(await feeManager.getFee(ProtocolAction.WRITE)).to.equal(ethers.parseEther(WRITE_FEE));
      expect(await feeManager.getFee(ProtocolAction.DERIVE)).to.equal(ethers.parseEther(DERIVE_FEE));
      expect(await feeManager.getFee(ProtocolAction.DERIVE_WILDCARD)).to.equal(ethers.parseEther(DERIVE_WILDCARD_FEE));
      expect(await feeManager.getFee(ProtocolAction.CLAIM_DERIVED_ROYALTY)).to.equal(ethers.parseEther(CLAIM_ROYALTY_FEE));
    });
  })

})