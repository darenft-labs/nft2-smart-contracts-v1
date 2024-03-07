import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { accessControlErrorRegex, convertPercentageToBasisPoint, CollectionSettings, FreeMintKind } from "./helpers/utils";
import { token } from "../typechain-types/@openzeppelin/contracts";

import { IERC165InterfaceId } from "./helpers/utils";

const COLLECTION_NAME = "Bored Age";
const COLLECTION_SYMBOL = "BAYC";
const ROYALTY_RATE = 10; // in percentages
const TOKEN_URI = "ipfs://bayc-1";
const IS_VALID_SIGNER_SELECTOR = "0x523e3260";
const ZERO_SELECTOR = "0x00000000";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: convertPercentageToBasisPoint(ROYALTY_RATE),
  isSoulBound: false,
  isFreeMintable: FreeMintKind.NON_FREE_MINT,
  isSemiTransferable: false,
};

const ROYALTY_AMOUNT_ETH = "5.5";
const ROYALTY_AMOUNT_ERC20 = "100000";

describe("DerivedAccount", function(){
  // fixtures
  async function deployFactoryAndGenesisCollection(){
    const [owner, account2] = await ethers.getSigners();

    const dataRegistryImpl = await ethers.deployContract("DataRegistry");
    const collectionImpl = await ethers.deployContract("Collection");
    const derivedAccountImpl = await ethers.deployContract("DerivedAccount");
    const erc721A = await ethers.deployContract("Collection721A");

    const Factory = await ethers.getContractFactory("Factory");    
    const factory = await upgrades.deployProxy(Factory, [dataRegistryImpl.target, collectionImpl.target, derivedAccountImpl.target, erc721A.target, dataRegistryImpl.target]);
    await factory.waitForDeployment();

    // deploy collection for minting nft
    {
      const tx = await factory.createCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_SETTINGS, 0);
      await tx.wait();
    }
    const nftCollectionAddr = await factory.collectionOf(owner.address, COLLECTION_NAME, COLLECTION_SYMBOL);
    const nftCollection = await ethers.getContractAt("Collection", nftCollectionAddr);

    // mint some nft
    {
      const tx = await nftCollection.safeMint(account2.address);
      await tx.wait();
    }
    const tokenId = 0;
    expect(await nftCollection.ownerOf(tokenId)).to.equal(account2.address);

    {
      const tx = await factory.createDerivedAccount(nftCollection.target, tokenId);
      await tx.wait();
    }
    const derivedAccountAddr = await factory.derivedAccountOf(nftCollection.target, tokenId);
    const derivedAccount = await ethers.getContractAt("DerivedAccount", derivedAccountAddr);

    // erc20
    const erc20Token = await ethers.deployContract("USDT", [owner.address]);

    return {owner, account2, factory, nftCollection, derivedAccount, erc20Token};
  }

  async function accrueRoyaltyNativeTokenAndERC20(){
    const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(deployFactoryAndGenesisCollection);
    {
      const tx = await owner.sendTransaction({to: derivedAccount.target, value: ethers.parseEther(ROYALTY_AMOUNT_ETH)});
      await tx.wait();
    }

    {
      const tx = await erc20Token.mint(owner.address, ethers.parseEther(ROYALTY_AMOUNT_ERC20));
      await tx.wait();
    }

    {
      const tx = await erc20Token.transfer(derivedAccount.target, ethers.parseEther(ROYALTY_AMOUNT_ERC20));
      await tx.wait();
    }

    return {owner, account2, factory, nftCollection, derivedAccount, erc20Token};
  }

  describe("Deployment", function(){
    it("Should create derived account successfully", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount} = await loadFixture(deployFactoryAndGenesisCollection);

      expect(derivedAccount.target).to.be.properAddress;
      expect(derivedAccount.target).to.not.equal(ethers.ZeroAddress);

      const [chainId, tokenContract, tokenId] = await derivedAccount.token();
      expect(tokenContract).to.equal(nftCollection.target);
      expect(tokenId).to.equal(0);
    });
  });

  describe("Royalty", function(){
    describe("Receive", function(){
      it("Should receive native token successfully", async function(){
        const {owner, account2, factory, nftCollection, derivedAccount} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

        expect(await ethers.provider.getBalance(derivedAccount.target)).to.equal(ethers.parseEther(ROYALTY_AMOUNT_ETH));
      });

      it("Should receive ERC20 token successfully", async function(){
        const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

        expect(await erc20Token.balanceOf(derivedAccount.target)).to.equal(ethers.parseEther(ROYALTY_AMOUNT_ERC20));
      });
    });

    describe("Claim", function(){
      it("Should claim royalty by native token successfully", async function(){
        const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

        const beforeBalanceOwner = await ethers.provider.getBalance(owner.address);
        const beforeBalanceAccount2 = await ethers.provider.getBalance(account2.address);

        {
          const tx = await derivedAccount.claimRoyalty(ethers.ZeroAddress, ethers.parseEther(ROYALTY_AMOUNT_ETH));
          await tx.wait();
        }

        const afterBalanceOwner = await ethers.provider.getBalance(owner.address);
        const afterBalanceAccount2 = await ethers.provider.getBalance(account2.address);

        const royaltyOwner = Math.abs(parseFloat(ethers.formatEther(afterBalanceOwner)) - parseFloat(ethers.formatEther(beforeBalanceOwner)));
        const royaltyAccount2 = Math.abs(parseFloat(ethers.formatEther(afterBalanceAccount2)) - parseFloat(ethers.formatEther(beforeBalanceAccount2)));

        expect(Math.abs(royaltyOwner - parseFloat(ROYALTY_AMOUNT_ETH)*ROYALTY_RATE/100)).to.lessThan(1e-3);
        expect(Math.abs(royaltyAccount2 - parseFloat(ROYALTY_AMOUNT_ETH)*(100-ROYALTY_RATE)/100)).to.lessThan(1e-3);
      });

      it("Should emit events properly upon claiming native token", async function(){
        const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

        const amount = "1";
        await expect(derivedAccount.claimRoyalty(ethers.ZeroAddress, ethers.parseEther(amount)))
                .to.emit(derivedAccount, "RoyaltyClaimed")
                .withArgs(owner.address, ethers.ZeroAddress, anyValue);

        await expect(derivedAccount.claimRoyalty(ethers.ZeroAddress, ethers.parseEther(amount)))
                .to.emit(derivedAccount, "RoyaltyClaimed")
                .withArgs(account2.address, ethers.ZeroAddress, anyValue);
      });

      it("Should claim royalty by ERC20 token successfully", async function(){
        const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

        const beforeBalanceOwner = await erc20Token.balanceOf(owner.address);
        const beforeBalanceAccount2 = await erc20Token.balanceOf(account2.address);

        {
          const tx = await derivedAccount.claimRoyalty(erc20Token.target, ethers.parseEther(ROYALTY_AMOUNT_ERC20));
          await tx.wait();
        }

        const afterBalanceOwner = await erc20Token.balanceOf(owner.address);
        const afterBalanceAccount2 = await erc20Token.balanceOf(account2.address);

        const royaltyOwner = Math.abs(parseFloat(ethers.formatEther(afterBalanceOwner)) - parseFloat(ethers.formatEther(beforeBalanceOwner)));
        const royaltyAccount2 = Math.abs(parseFloat(ethers.formatEther(afterBalanceAccount2)) - parseFloat(ethers.formatEther(beforeBalanceAccount2)));

        expect(Math.abs(royaltyOwner - parseFloat(ROYALTY_AMOUNT_ERC20)*ROYALTY_RATE/100)).to.lessThan(1e-5);
        expect(Math.abs(royaltyAccount2 - parseFloat(ROYALTY_AMOUNT_ERC20)*(100-ROYALTY_RATE)/100)).to.lessThan(1e-5);
      });

      it("Should emit events properly upon claiming ERC20 token", async function(){
        const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

        const amount = "10000";
        await expect(derivedAccount.claimRoyalty(erc20Token.target, ethers.parseEther(amount)))
                .to.emit(derivedAccount, "RoyaltyClaimed")
                .withArgs(owner.address, erc20Token.target, anyValue);

        await expect(derivedAccount.claimRoyalty(erc20Token.target, ethers.parseEther(amount)))
                .to.emit(derivedAccount, "RoyaltyClaimed")
                .withArgs(account2.address, erc20Token.target, anyValue);
      });
    });
  });

  describe("Execute", function(){
    it("Should revert on execution request", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      await expect(derivedAccount.execute(erc20Token.target, ethers.parseEther("0.01"),"0x",0))
              .to.be.reverted;
    });
  });

  describe("RoyaltyBatch", function(){
    it("Should revert due to unequal input length", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      await expect(derivedAccount.claimRoyaltyBatch([ethers.ZeroAddress, erc20Token.target], [ethers.parseEther(ROYALTY_AMOUNT_ERC20)]))
              .to.be.revertedWith("Input array MUST be the same length");
    });

    it("Should revert due to excessive input length", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);
      let addresses: string[] = [];
      let amounts: bigint[] = [];
      for (let j=0;j<100;j++){
        addresses.push(erc20Token.target.toString());
        amounts.push(ethers.parseEther(ROYALTY_AMOUNT_ERC20));
      }

      await expect(derivedAccount.claimRoyaltyBatch(addresses, amounts))
              .to.be.revertedWith("Input array MUST be less than limit");
    });

    it("Should claim royalty batch successfully", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      const beforeBalanceOwner = await erc20Token.balanceOf(owner.address);
      const beforeBalanceAccount2 = await erc20Token.balanceOf(account2.address);
      const beforeBalanceOwnerETH = await ethers.provider.getBalance(owner.address);
      const beforeBalanceAccount2ETH = await ethers.provider.getBalance(account2.address);

      {
        const tx = await derivedAccount.claimRoyaltyBatch([ethers.ZeroAddress, erc20Token.target], [ethers.parseEther(ROYALTY_AMOUNT_ETH), ethers.parseEther(ROYALTY_AMOUNT_ERC20)]);
        await tx.wait();
      }

      const afterBalanceOwner = await erc20Token.balanceOf(owner.address);
      const afterBalanceAccount2 = await erc20Token.balanceOf(account2.address);

      const royaltyOwner = Math.abs(parseFloat(ethers.formatEther(afterBalanceOwner)) - parseFloat(ethers.formatEther(beforeBalanceOwner)));
      const royaltyAccount2 = Math.abs(parseFloat(ethers.formatEther(afterBalanceAccount2)) - parseFloat(ethers.formatEther(beforeBalanceAccount2)));

      expect(Math.abs(royaltyOwner - parseFloat(ROYALTY_AMOUNT_ERC20)*ROYALTY_RATE/100)).to.lessThan(1e-5);
      expect(Math.abs(royaltyAccount2 - parseFloat(ROYALTY_AMOUNT_ERC20)*(100-ROYALTY_RATE)/100)).to.lessThan(1e-5);

      const afterBalanceOwnerETH = await ethers.provider.getBalance(owner.address);
      const afterBalanceAccount2ETH = await ethers.provider.getBalance(account2.address);

      const royaltyOwnerETH = Math.abs(parseFloat(ethers.formatEther(afterBalanceOwnerETH)) - parseFloat(ethers.formatEther(beforeBalanceOwnerETH)));
      const royaltyAccount2ETH = Math.abs(parseFloat(ethers.formatEther(afterBalanceAccount2ETH)) - parseFloat(ethers.formatEther(beforeBalanceAccount2ETH)));

      expect(Math.abs(royaltyOwnerETH - parseFloat(ROYALTY_AMOUNT_ETH)*ROYALTY_RATE/100)).to.lessThan(1e-3);
      expect(Math.abs(royaltyAccount2ETH - parseFloat(ROYALTY_AMOUNT_ETH)*(100-ROYALTY_RATE)/100)).to.lessThan(1e-3);
    });
  });

  describe("ERC6551", function(){
    it("owner", async function() {
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      expect(await derivedAccount.owner()).to.equal(account2.address);
    });

    it("token", async function() {
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      const [chainId, contract, tokenId] = await derivedAccount.token();
      expect(chainId).to.not.equal(0);
      expect(contract).to.equal(nftCollection.target);
      expect(tokenId).to.equal(0);
    });

    it("isValidSigner", async function() {
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      expect(await derivedAccount.isValidSigner(account2.address, "0x")).to.equal(IS_VALID_SIGNER_SELECTOR);
      expect(await derivedAccount.isValidSigner(owner.address, "0x")).to.not.equal(IS_VALID_SIGNER_SELECTOR);
    });

    it("isValidSignature", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      expect(await derivedAccount.isValidSignature(ethers.id("FOO"), "0x")).to.equal(ZERO_SELECTOR);
    });
  });

  describe("ERC165", function(){
    it("Should determine ERC165 interfaceId properly", async function(){
      const {owner, account2, factory, nftCollection, derivedAccount, erc20Token} = await loadFixture(accrueRoyaltyNativeTokenAndERC20);

      expect(await derivedAccount.supportsInterface(IERC165InterfaceId())).to.equal(true);
    });
  });
});
