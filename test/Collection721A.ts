import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { CollectionSettings, convertPercentageToBasisPoint, encodeCollectionSettings,
          IERC165InterfaceId, IERC721InterfaceId, IERC721MetadataInterfaceId,
          IFreeMintableInterfaceId, ISemiTransferableInterfaceId, IERC2981InterfaceId,
          FreeMintKind } from "./helpers/utils";

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages
const TOKEN_URI1 = "ipfs://bayc-1";
const TOKEN_URI2 = "ipfs://bayc-2";
const TOKEN_URI3 = "ipfs://bayc-3";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

const NUMBER_MINTED = 1000;

describe("Collection721A", function(){
  // fixtures
  async function deployFixture() {
    const {collection, owner, account2} = await loadFixture(deployCollection);

    // initialize
    let settings : string = encodeCollectionSettings(COLLECTION_SETTINGS);
    await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

    return {collection, owner, account2};
  }

  async function deployCollection() {
    const [owner, account2] = await ethers.getSigners();

    const collection = await ethers.deployContract("Collection721A");
    return {collection, owner, account2};
  }

  describe("Deployment", function(){
    it("Should deploy successfully", async function(){
      const {collection, owner} = await loadFixture(deployFixture);
      expect(await collection.getAddress()).to.be.properAddress;
      expect(await collection.getAddress()).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("MintBatch", function(){
    it("Should mint batch reverted due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);

      await expect(collection.connect(account2).mintBatch(NUMBER_MINTED)).to.be.reverted;      
    });

    it("Should mint batch successfully", async function(){
      const {collection, owner} = await loadFixture(deployFixture);

      await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
      expect(await collection.balanceOf(owner.address)).to.equal(NUMBER_MINTED);
    });
  });

  describe("Burn", function(){
    it("Should burn failed due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;

      const tokenId = 0;
      await expect(collection.connect(account2).burn(tokenId))
              .to.be.revertedWith("Sender MUST be owner of token");
    });

    it("Should burn failed due to invalid tokenId", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;

      const tokenId = NUMBER_MINTED;
      await expect(collection.burn(tokenId)).to.be.reverted;
    });

    it("Should burn succeeded", async function(){
      const {collection, owner, account2} = await loadFixture(deployFixture);
      await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
      const tokenId = 0;

      // before
      expect(await collection.ownerOf(tokenId)).to.equal(owner.address);

      await expect(collection.burn(tokenId)).to.not.be.reverted;

      // after
      await expect(collection.ownerOf(tokenId)).to.be.reverted;
    });
  });

  describe("SoulBound", function(){
    it("Should transfer will be succeeded if soul-bound is disable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;

      const tokenId = 0;
      expect(await collection.ownerOf(tokenId)).to.equal(owner.address);

      await expect(collection.transferFrom(owner.address, account2.address, tokenId)).to.not.be.reverted;
      expect(await collection.ownerOf(tokenId)).to.equal(account2.address);
    });

    it("Should transfer will be reverted if soul-bound is enable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: true,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;

      const tokenId = 0;
      expect(await collection.ownerOf(tokenId)).to.equal(owner.address);

      await expect(collection.transferFrom(owner.address, account2.address, tokenId)).to.be.reverted;
    });

    it("Should soulbound addons is visible", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
      expect(await collection.isSoulBound()).to.equal(false);

      const collection2 = await ethers.deployContract("Collection721A");
      let settings2 : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: true,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection2.initialize(owner.address, `${COLLECTION_NAME}-1`, `${COLLECTION_SYMBOL}-1`, settings2);
      expect(await collection2.isSoulBound()).to.equal(true);
    });
  });

  describe("FreeMintable", function(){
    it("Should free-mint will be reverted if disable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.connect(account2).freeMint(owner.address)).to.be.reverted;
    });

    it("Should free-mint successfully if enable", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.FREE_MINT_COMMUNITY,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.connect(account2).freeMint(owner.address)).to.not.be.reverted;
      const tokenId = 0;
      expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
    });

    it("Should freemint addons is visible", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: false,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
      expect(await collection.isFreeMintable()).to.equal(FreeMintKind.NON_FREE_MINT);

      const collection2 = await ethers.deployContract("Collection721A");
      let settings2 : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: true,
        isFreeMintable: FreeMintKind.FREE_MINT_COMMUNITY,
        isSemiTransferable: false,
      });
      await collection2.initialize(owner.address, `${COLLECTION_NAME}-1`, `${COLLECTION_SYMBOL}-1`, settings2);
      expect(await collection2.isFreeMintable()).to.equal(FreeMintKind.FREE_MINT_COMMUNITY);
    });
  });

  describe("SemiTransferable", function(){
    describe("Lock", function(){
      it("Should lock/unlock/isLocked reverted should semi-transferable addons is disable", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: false,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        
        const tokenId = 0;
        await expect(collection.lock(tokenId)).to.be.reverted;
        await expect(collection.unlock(tokenId)).to.be.reverted;
        await expect(collection.isLocked(tokenId)).to.be.reverted;
      });

      it("Should lock reverted due to illegitimate sender", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.connect(account2).lock(tokenId))
                .to.be.revertedWith("Sender MUST be owner of token");        
      });

      it("Should lock successfully", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId)).to.not.be.reverted;
        expect(await collection.isLocked(tokenId)).to.equal(true);
  
        await expect(collection.transferFrom(owner.address, account2.address, tokenId)).to.be.reverted;
      });

      it("Should emit event properly", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId))
                .to.emit(collection, "Lock")
                .withArgs(owner.address, tokenId);        
      });

      it("Should semi-transferable addons is visible", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: false,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
        expect(await collection.isSemiTransferable()).to.equal(false);
  
        const collection2 = await ethers.deployContract("Collection721A");
        let settings2 : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: true,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection2.initialize(owner.address, `${COLLECTION_NAME}-1`, `${COLLECTION_SYMBOL}-1`, settings2);
        expect(await collection2.isSemiTransferable()).to.equal(true);
      });
    });

    describe("Unlock", function(){
      it("Should unlock reverted due to illegitimate sender", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId)).to.not.be.reverted;
        await expect(collection.connect(account2).unlock(tokenId))
                .to.be.revertedWith("Sender MUST be owner of token");        
      });

      it("Should unlock successfully", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId)).to.not.be.reverted;
        await expect(collection.unlock(tokenId)).to.not.be.reverted;
        expect(await collection.isLocked(tokenId)).to.equal(false);
      });

      it("Should emit event properly", async function(){
        const {collection, owner, account2} = await loadFixture(deployCollection);
  
        let settings : string = encodeCollectionSettings({
          royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
          isSoulBound: false,
          isFreeMintable: FreeMintKind.NON_FREE_MINT,
          isSemiTransferable: true,
        });
        await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);
  
        await expect(collection.mintBatch(NUMBER_MINTED)).to.not.be.reverted;
        const tokenId = 0;
        expect(await collection.ownerOf(tokenId)).to.equal(owner.address);
        
        await expect(collection.lock(tokenId)).to.not.be.reverted;
        await expect(collection.unlock(tokenId))
                .to.emit(collection, "Unlock")
                .withArgs(owner.address, tokenId);
      });
    });
    
  });

  describe("MintBatchTo", function(){
    it("Should mintBatchTo reverted due to unauthorized access", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);
      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: true,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.connect(account2).mintBatchTo(account2.address, NUMBER_MINTED))
              .to.be.reverted;
    });

    it("Should mintBatchTo succeeded", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);
      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: true,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      await expect(collection.mintBatchTo(account2.address, NUMBER_MINTED))
              .to.not.be.reverted;
      
      const tokenId = 0;
      expect(await collection.ownerOf(tokenId)).to.equal(account2.address);
      expect(await collection.ownerOf(NUMBER_MINTED-1)).to.equal(account2.address);
      
      await expect(collection.ownerOf(NUMBER_MINTED))
              .to.be.reverted;
    });
  });

  describe("NextTokenId", function(){
    it("Should return nextTokenId properly", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);
      let settings : string = encodeCollectionSettings({
        royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
        isSoulBound: false,
        isFreeMintable: FreeMintKind.NON_FREE_MINT,
        isSemiTransferable: true,
      });
      await collection.initialize(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL, settings);

      const tokenId = 0;
      expect(await collection.nextTokenId()).to.equal(tokenId);

      await expect(collection.mintBatchTo(account2.address, NUMBER_MINTED))
              .to.not.be.reverted;
      expect(await collection.nextTokenId()).to.equal(NUMBER_MINTED);
    });
  });

  describe("ERC165", function(){
    it("Should determine ERC165 interfaceId properly", async function(){
      const {collection, owner, account2} = await loadFixture(deployCollection);

      // add-ons
      expect(await collection.supportsInterface(IFreeMintableInterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(ISemiTransferableInterfaceId())).to.equal(true);

      // based
      expect(await collection.supportsInterface(IERC165InterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(IERC721InterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(IERC721MetadataInterfaceId())).to.equal(true);
      expect(await collection.supportsInterface(IERC2981InterfaceId())).to.equal(true);
    });
  });

});