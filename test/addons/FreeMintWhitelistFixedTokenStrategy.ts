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
import { buildTree, createLeaf } from "../helpers/merkle-fixed-token";
import { abiEncodeCampaignId } from "../helpers/abi-coder";

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages
const TOKEN_URI1 = "ipfs://bayc-1";
const TOKEN_URI2 = "ipfs://bayc-2";
const TOKEN_URI3 = "ipfs://bayc-3";

const CAMPAIGN_NAME_1 = "Campaign 1";
const FEE = "0.0001";
const AMOUNT_1 = 1;

const COLLECTION_SETTINGS: CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

describe("FreeMintWhitelistFixedToken", function () {
  // fixtures
  async function deployFixture() {
    const { collection, owner, account2 } = await loadFixture(deployCollection);

    // initialize
    let settings: string = encodeCollectionSettings(COLLECTION_SETTINGS);
    await collection.initialize(
      owner.address,
      COLLECTION_NAME,
      COLLECTION_SYMBOL,
      settings
    );

    let startTime = await time.latest();
    let endTime = startTime + 30 * 24 * 3600;

    const freeMintWhitelist = await ethers.deployContract(
      "FreeMintWhitelistFixedTokenStrategy"
    );
    await freeMintWhitelist.initialize(
      owner.address,
      collection.target,
      CAMPAIGN_NAME_1,
      startTime,
      endTime,
      ethers.parseEther(FEE)
    );
    await collection.grantRole(
      await collection.MINTER_ROLE(),
      freeMintWhitelist.target
    );

    const freeMintWhitelistSoon = await ethers.deployContract(
      "FreeMintWhitelistFixedTokenStrategy"
    );
    await freeMintWhitelistSoon.initialize(
      owner.address,
      collection.target,
      CAMPAIGN_NAME_1,
      await time.latest() + 7*24*3600,
      await time.latest() + 30*24*3600,
      ethers.parseEther(FEE)
    );
    await collection.grantRole(
      await collection.MINTER_ROLE(),
      freeMintWhitelistSoon.target
    );

    const freeMintWhitelistLate = await ethers.deployContract(
      "FreeMintWhitelistFixedTokenStrategy"
    );
    await freeMintWhitelistLate.initialize(
      owner.address,
      collection.target,
      CAMPAIGN_NAME_1,
      await time.latest() - 30*24*3600,
      await time.latest() - 7*24*3600,
      ethers.parseEther(FEE)
    );
    await collection.grantRole(
      await collection.MINTER_ROLE(),
      freeMintWhitelistLate.target
    );

    return { freeMintWhitelist, collection, owner, account2, freeMintWhitelistSoon, freeMintWhitelistLate, startTime, endTime };
  }

  async function deployCollection() {
    const [owner, account2, account3] = await ethers.getSigners();

    const collection = await ethers.deployContract("Collection");
    return { collection, owner, account2, account3 };
  }

  describe("Deployment", function() {
    it("Should deploy successfully", async function(){
      const { freeMintWhitelist, collection, owner, account2, freeMintWhitelistSoon, freeMintWhitelistLate, startTime, endTime } = await loadFixture(deployFixture);

      expect(freeMintWhitelist.target).to.be.properAddress;

      expect(await freeMintWhitelist.campaignId()).to.equal(
        abiEncodeCampaignId(
          await collection.getAddress(),          
          AddonsKind.FREE_MINT_WHITELIST_FIXED_TOKEN,
          CAMPAIGN_NAME_1,
          startTime,
          endTime,
          ethers.parseEther(FEE),
        )
      );
    });
  });

  describe("Update Merkle root", function () {
    it("Should reverted due to unauthorized", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      await expect(
        freeMintWhitelist.connect(account2).updateMerkleRoot(ethers.id("foo"))
      ).to.be.reverted;
    });

    it("Should success", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const dummy = ethers.id("foo");
      await expect(freeMintWhitelist.updateMerkleRoot(dummy)).to.not.be
        .reverted;

      expect(await freeMintWhitelist.merkleRoot()).to.equal(dummy);
    });
  });

  describe("Freemint", function () {
    it("Should freemint failed due to too soon", async function(){
      const {freeMintWhitelist, collection, owner, account2, freeMintWhitelistSoon, freeMintWhitelistLate} = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [owner.address, account2.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be.reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(owner.address, 0, TOKEN_URI1);
      await expect(freeMintWhitelistSoon.freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
        value: ethers.parseEther(FEE),
      })).to.be.revertedWith("FreeMint campaign is not available yet");
    });

    it("Should freemint failed due to too late", async function(){
      const {freeMintWhitelist, collection, owner, account2, freeMintWhitelistSoon, freeMintWhitelistLate} = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [owner.address, account2.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be.reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(owner.address, 0, TOKEN_URI1);
      await expect(freeMintWhitelistLate.freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
        value: ethers.parseEther(FEE),
      })).to.be.revertedWith("FreeMint campaign is finished already");
    });

    it("Should freemint failed due to invalid proof", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist.freeMintWhitelist(leafData, [ethers.id("foo")], AMOUNT_1)
      ).to.be.reverted;
    });

    it("Should freemint failed due to insufficient value", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist.freeMintWhitelist(leafData, proofs[0], AMOUNT_1, { value: 0 })
      ).to.be.revertedWith("Message value is insufficient");
    });

    it("Should freemint failed due to unauthorized sender", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist.freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
          value: ethers.parseEther(FEE),
        })
      ).to.be.revertedWith("Sender MUST be whitelisted wallet");
    });

    it("Should freemint failed due to excessive amount", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist.connect(account2).freeMintWhitelist(leafData, proofs[0], AMOUNT_1+1, {
          value: ethers.parseEther(FEE),
        })
      ).to.be.revertedWith("Only mint one token per try");
    });

    it("Should freemint failed on replay", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist
          .connect(account2)
          .freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
            value: ethers.parseEther(FEE),
          })
      ).to.not.be.reverted;

      // replay
      await expect(
        freeMintWhitelist
          .connect(account2)
          .freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
            value: ethers.parseEther(FEE),
          })
      ).to.be.revertedWith("Token has already claimed");
    });

    it("Should freemint successfully", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist
          .connect(account2)
          .freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
            value: ethers.parseEther(FEE),
          })
      ).to.not.be.reverted;

      const collection = await ethers.getContractAt(
        "Collection",
        await freeMintWhitelist.collection()
      );
      expect(await collection.ownerOf(0)).to.equal(account2.address);      
    });

    it("Should freemint emit event properly", async function () {
      const [owner, account2, account3] = await ethers.getSigners();
      const { freeMintWhitelist } = await loadFixture(deployFixture);

      const { rootHash, proofs } = buildTree(
        [account2.address, account3.address],
        [0, 1],
        [TOKEN_URI1, TOKEN_URI2]
      )!;

      await expect(freeMintWhitelist.updateMerkleRoot(rootHash)).to.not.be
        .reverted;
      expect(await freeMintWhitelist.merkleRoot()).to.equal(rootHash);

      const leafData = createLeaf(account2.address, 0, TOKEN_URI1);
      await expect(
        freeMintWhitelist
          .connect(account2)
          .freeMintWhitelist(leafData, proofs[0], AMOUNT_1, {
            value: ethers.parseEther(FEE),
          })
      ).to.emit(freeMintWhitelist, "FreeMint")
          .withArgs(account2.address, AMOUNT_1);
    });
  });
});
