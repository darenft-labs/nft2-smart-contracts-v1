import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
  AddonsKind,
} from "../helpers/utils";


describe("AddonsManager", function(){
  // fixtures  
  async function deployFixture() {
    const { freeMintWhitelistFCFS, freeMintWhitelistFixedToken } = await loadFixture(deployStrategies);

    const { addOnsManager } = await loadFixture(deployManager);

    await addOnsManager.registerStrategy(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS);
    await addOnsManager.registerStrategy(freeMintWhitelistFixedToken, AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN);

    return { addOnsManager, freeMintWhitelistFCFS, freeMintWhitelistFixedToken };
  }

  async function deployManager() {
    const AddonsManagerContract = await ethers.getContractFactory("AddonsManager");
    const deployAddonsManager = await upgrades.deployProxy(AddonsManagerContract, []);
    await deployAddonsManager.waitForDeployment();

    const addOnsManager = await ethers.getContractAt("AddonsManager", deployAddonsManager.target); 

    return { addOnsManager };
  }

  async function deployStrategies() {
    const freeMintWhitelistFCFS = await ethers.deployContract("FreeMintWhitelistFCFSStrategy");
    const freeMintWhitelistFixedToken = await ethers.deployContract("FreeMintWhitelistFixedTokenStrategy");

    return { freeMintWhitelistFCFS, freeMintWhitelistFixedToken };
  }

  describe("Deployment", function(){
    it("Should deploy successfully", async function(){
      const { addOnsManager } = await loadFixture(deployFixture);
      expect(await addOnsManager.getAddress()).to.be.properAddress;
    });
  })

  describe("Strategy", function(){
    it("Should register failed due to unauthorized", async function(){
      const [owner, account2, account3] = await ethers.getSigners();
      const { addOnsManager } = await loadFixture(deployFixture);

      const freeMintWhitelistFCFSDummy = await ethers.deployContract("FreeMintWhitelistFCFSStrategy");
      await expect(addOnsManager.connect(account2).registerStrategy(freeMintWhitelistFCFSDummy.target, AddonsKind.FREE_MINT_WHITELIST_FCFS))
              .to.be.reverted;
    });

    it("Should register failed due to duplicated", async function(){
      const { addOnsManager, freeMintWhitelistFCFS } = await loadFixture(deployFixture);

      await expect(addOnsManager.registerStrategy(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS))
              .to.be.revertedWith("Strategy: Already whitelisted");
    });

    it("Should register successfully", async function(){
      const { addOnsManager } = await loadFixture(deployManager);
      const { freeMintWhitelistFCFS, freeMintWhitelistFixedToken } = await loadFixture(deployStrategies);

      await expect(addOnsManager.registerStrategy(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS))
              .to.not.reverted;
    });

    it("Should register emit event properly", async function(){
      const { addOnsManager } = await loadFixture(deployManager);
      const { freeMintWhitelistFCFS } = await deployStrategies();

      await expect(addOnsManager.registerStrategy(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS))
              .to.emit(addOnsManager, "RegisterStrategy")
              .withArgs(freeMintWhitelistFCFS.target, AddonsKind.FREE_MINT_WHITELIST_FCFS);
    });

    it("Should lookup whitelisted strategy properly", async function(){
      const { addOnsManager, freeMintWhitelistFCFS } = await loadFixture(deployFixture);

      expect(await addOnsManager.isWhitelistedStrategy(freeMintWhitelistFCFS)).to.equal(true);
    });

    it("Should lookup strategy by kind properly", async function(){
      const { addOnsManager, freeMintWhitelistFCFS, freeMintWhitelistFixedToken } = await loadFixture(deployFixture);

      expect(await addOnsManager.strategyOfKind(AddonsKind.FREE_MINT_WHITELIST_FCFS)).to.equal(freeMintWhitelistFCFS.target);
      expect(await addOnsManager.strategyOfKind(AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN)).to.equal(freeMintWhitelistFixedToken.target);
    });
  })
})