import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
  CollectionSettings,
  convertPercentageToBasisPoint,
  encodeCollectionSettings,  
  FreeMintKind,
  AddonsKind,
} from "../helpers/utils";

import { buildTree, createLeaf } from "../helpers/merkle-fcfs";
import { abiEncodeCampaignId, abiEncodeCommunityCampaignId } from "../helpers/abi-coder";

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages

const CAMPAIGN_NAME_1 = "Campaign 1";
const FEE = "0.0001";
const QUANTITY_1 = 3;
const QUANTITY_2 = 5;
const QUANTITY_3 = 8;
const AMOUNT_1 = 1;
const AMOUNT_2 = 2;
const AMOUNT_3 = 5;
const MAX_ALLOCATION = 10;

const COLLECTION_SETTINGS: CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

describe("FreeMintCommunity", function(){
  // fixtures
  async function deployFixture() {
    const {collection, owner, account2} = await loadFixture(deployCollection);
    
    // initialize    
    let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
    await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

    let startTime = await time.latest();
    let endTime = startTime + 30 * 24 * 3600;
    const freeMint = await ethers.deployContract("FreeMintCommunityStrategy");
    await freeMint.initialize(
      owner.address,
      collection.target, 
      CAMPAIGN_NAME_1,
      startTime,
      endTime,
      ethers.parseEther(FEE),
      MAX_ALLOCATION,
    );
    await collection.grantRole(await collection.MINTER_ROLE(), freeMint.target);

    const freeMintSoon = await ethers.deployContract("FreeMintCommunityStrategy");
    await freeMintSoon.initialize(
      owner.address,
      collection.target, 
      CAMPAIGN_NAME_1,
      await time.latest() + 7*24*3600,
      await time.latest() + 30*24*3600,
      ethers.parseEther(FEE),
      MAX_ALLOCATION,
    );    
    await collection.grantRole(await collection.MINTER_ROLE(), freeMintSoon.target);

    const freeMintLate = await ethers.deployContract("FreeMintCommunityStrategy");
    await freeMintLate.initialize(
      owner.address,
      collection.target, 
      CAMPAIGN_NAME_1,
      await time.latest() - 30*24*3600,
      await time.latest() - 7*24*3600,
      ethers.parseEther(FEE),
      MAX_ALLOCATION,
    );    
    await collection.grantRole(await collection.MINTER_ROLE(), freeMintLate.target);

    return {freeMint, collection, owner, account2, freeMintSoon, freeMintLate, startTime, endTime};
  }

  async function deployCollection() {
    const [owner, account2, account3] = await ethers.getSigners();

    const collection = await ethers.deployContract("Collection");
    return {collection, owner, account2, account3};
  }

  describe("Deployment", function() {
    it("Should deploy successfully", async function(){
      const { freeMint, collection, owner, account2, freeMintSoon, freeMintLate, startTime, endTime } = await loadFixture(deployFixture);

      expect(freeMint.target).to.be.properAddress;

      expect(await freeMint.campaignId()).to.equal(
        abiEncodeCommunityCampaignId(
          await collection.getAddress(),          
          AddonsKind.FREE_MINT_COMMUNITY,
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther(FEE),
          MAX_ALLOCATION,
        )
      );
    });
  }); 

  describe("Freemint", function(){
    it("Should freemint failed due to too soon", async function(){
      const { freeMint, collection, owner, account2, freeMintSoon, freeMintLate, startTime, endTime } = await loadFixture(deployFixture);

      await expect(freeMintSoon.freeMint(AMOUNT_1, {
        value: ethers.parseEther(FEE),
      })).to.be.revertedWith("FreeMint campaign is not available yet");
    });

    it("Should freemint failed due to too late", async function(){
      const { freeMint, collection, owner, account2, freeMintSoon, freeMintLate, startTime, endTime } = await loadFixture(deployFixture);

      await expect(freeMintLate.freeMint(AMOUNT_1, {
        value: ethers.parseEther(FEE),
      })).to.be.revertedWith("FreeMint campaign is finished already");
    });

    it("Should freemint failed due to insufficient value", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMint } = await loadFixture(deployFixture);

      await expect(
        freeMint.freeMint(AMOUNT_1, { value: 0 })
      ).to.be.revertedWith("Message value is insufficient");
    });

    it("Should freemint failed due to excessive amount", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMint } = await loadFixture(deployFixture);

      await expect(
        freeMint.connect(account2)
          .freeMint(MAX_ALLOCATION+1, {
          value: ethers.parseEther(FEE),
        })
      ).to.be.revertedWith("Can not claim more than maximum allocation");
    });

    it("Should freemint successfully", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMint } = await loadFixture(deployFixture);

      await expect(
        freeMint.connect(account2).freeMint(QUANTITY_1, { value: ethers.parseEther(FEE) })
      ).to.not.be.reverted;

      const collection = await ethers.getContractAt("Collection", await freeMint.collection());
      expect(await collection.ownerOf(0)).to.equal(account2.address);
      expect(await collection.ownerOf(QUANTITY_1-1)).to.equal(account2.address);

      await expect(collection.ownerOf(QUANTITY_1)).to.be.reverted;
    });

    it("Should freemint multiple times success", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMint } = await loadFixture(deployFixture);

      const collection = await ethers.getContractAt("Collection", await freeMint.collection());

      await expect(
        freeMint.connect(account3).freeMint(AMOUNT_1, { value: ethers.parseEther(FEE) })
      ).to.not.be.reverted;

      expect(await collection.ownerOf(0)).to.equal(account3.address);
      expect(await collection.ownerOf(AMOUNT_1-1)).to.equal(account3.address);

      await expect(
        freeMint.connect(account3).freeMint(AMOUNT_2, { value: ethers.parseEther(FEE) })
      ).to.not.be.reverted;

      expect(await collection.ownerOf(AMOUNT_1)).to.equal(account3.address);
      expect(await collection.ownerOf(AMOUNT_1 + AMOUNT_2-1)).to.equal(account3.address);

      await expect(
        freeMint.connect(account3).freeMint(MAX_ALLOCATION, { value: ethers.parseEther(FEE) })
      ).to.be.revertedWith("Can not claim more than maximum allocation");

      await expect(collection.ownerOf(AMOUNT_1 + AMOUNT_2)).to.be.reverted;
    });

    it("Should freemint emit event properly", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMint } = await loadFixture(deployFixture);

      await expect(
        freeMint.connect(account2).freeMint(QUANTITY_1, { value: ethers.parseEther(FEE) })
      ).to.emit(freeMint, "FreeMint")
        .withArgs(account2.address, QUANTITY_1);
    });
  });

  describe("ClaimableAmount", function(){
    it("Should lookup successfully", async function(){
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMint } = await loadFixture(deployFixture);

      expect(await 
        freeMint.claimableAmount(account2.address)
      ).to.equal(MAX_ALLOCATION);

      // claim
      const amount = 1;
      await expect(
        freeMint.connect(account2).freeMint(amount, { value: ethers.parseEther(FEE) })
      ).to.not.be.reverted;

      expect(await 
        freeMint.claimableAmount(account2.address)
      ).to.equal(MAX_ALLOCATION - amount);

      await expect(
        freeMint.connect(account2).freeMint(amount*2, { value: ethers.parseEther(FEE) })
      ).to.not.be.reverted;

      expect(await 
        freeMint.claimableAmount(account2.address)
      ).to.equal(MAX_ALLOCATION - amount*3);

      await expect(
        freeMint.connect(account2).freeMint(MAX_ALLOCATION - amount*3, { value: ethers.parseEther(FEE) })
      ).to.not.be.reverted;

      expect(await 
        freeMint.claimableAmount(account2.address)
      ).to.equal(0);

    });

  });
})

