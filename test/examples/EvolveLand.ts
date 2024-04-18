import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { convertPercentageToBasisPoint, CollectionSettings, encodeCollectionSettings, FreeMintKind, DataRegistrySettings } from "../helpers/utils";

const COLLECTION_NAME = "HERO";
const COLLECTION_SYMBOL = "HERO";

const COLLECTION_LAND_NAME = "LAND";
const COLLECTION_LAND_SYMBOL = "LAND";

const COLLECTION_SETTINGS : CollectionSettings = {
  royaltyRate: 1000,
  isSoulBound: false,
  isFreeMintable: 0,
  isSemiTransferable: false,
};

const ETH_FEE = ethers.parseEther("1");
const ERC20_FEE = ethers.parseEther("1000");
const LAND_FEE = ethers.parseEther("0.1");

describe("EvolveLand", function(){
  async function deployLandFixture() {
    const [ owner ] = await ethers.getSigners();

    const erc721Impl = await ethers.deployContract("Collection");
    const dataRegistryImpl = await ethers.deployContract("DataRegistryV2");
    const derivedAccountImpl = await ethers.deployContract("DerivedAccount");
    const erc721AImpl = await ethers.deployContract("Collection721A");
    const erc6551Impl = await ethers.deployContract("ERC6551Account");

    const Factory = await ethers.getContractFactory("Factory");
    const factory = await upgrades.deployProxy(Factory, [
      dataRegistryImpl.target,
      erc721Impl.target,
      derivedAccountImpl.target,
      erc721AImpl.target,
      dataRegistryImpl.target,
    ]);

    // initialization
    const tx = await factory.createCollection(
      COLLECTION_NAME,
      COLLECTION_SYMBOL,
      COLLECTION_SETTINGS,
      0
    );
    await tx.wait();

    const nftCollection = await ethers.getContractAt(
      "Collection",
      await factory.collectionOf(
        owner.address,
        COLLECTION_NAME,
        COLLECTION_SYMBOL
      )
    );

    const tx1 = await factory.createCollection(
      COLLECTION_LAND_NAME,
      COLLECTION_LAND_SYMBOL,
      COLLECTION_SETTINGS,
      0
    );
    await tx1.wait();

    const landCollection = await ethers.getContractAt(
      "Collection",
      await factory.collectionOf(
        owner.address,
        COLLECTION_LAND_NAME,
        COLLECTION_LAND_SYMBOL
      )
    );

    const erc20 = await ethers.deployContract("USDT", [owner.address]);

    const evolveLand = await ethers.deployContract("EvolveLand", [
      landCollection.target,
      ETH_FEE,
      ERC20_FEE,
      erc20.target,
      factory.target,
      erc6551Impl.target,
    ]);

    // grant roles
    await landCollection.grantRole(await landCollection.MINTER_ROLE(), evolveLand.target);

    return { evolveLand, landCollection, nftCollection, erc20 };
  }

  async function buyLandFixture() {
    const [ owner, account1 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(deployLandFixture);

    await evolveLand.connect(account1).buyLand({value: LAND_FEE});

    return { evolveLand, landCollection, nftCollection, erc20 };
  }

  async function mintNFTFixture() {
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(buyLandFixture);

    await nftCollection.safeMint(account2);
    await nftCollection.safeMint(account2);

    return { evolveLand, landCollection, nftCollection, erc20 };
  }

  async function evolveNFTFixture() {
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(mintNFTFixture);

    // evolve token 0
    await nftCollection.connect(account2).approve(evolveLand.target, 0);
    await evolveLand.connect(account2).evolveWithETH(0, nftCollection.target, 0, {value: ETH_FEE});

    // evolve token 1
    await erc20.mint(account2.address, ERC20_FEE);
    await erc20.connect(account2).approve(evolveLand, ERC20_FEE);
    await nftCollection.connect(account2).approve(evolveLand.target, 1);
    await evolveLand.connect(account2).evolveWithERC20(0, nftCollection.target, 1);

    return { evolveLand, landCollection, nftCollection, erc20 };
  }

  it("Should deploy successfully", async function(){
    const [ owner ] = await ethers.getSigners();
    const { evolveLand, landCollection, nftCollection } = await loadFixture(deployLandFixture);
    expect(await evolveLand.getAddress()).to.be.properAddress;
  });

  it("Should buy land failed due to insufficient value", async function(){
    const [ owner, account1 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection } = await loadFixture(deployLandFixture);

    await expect(evolveLand.connect(account1).buyLand()).to.be.revertedWith("Message value is not sufficient");
  });

  it("Should buy land successfully", async function(){
    const [ owner, account1 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection } = await loadFixture(deployLandFixture);

    await expect(evolveLand.connect(account1).buyLand({value: LAND_FEE})).to.not.be.reverted;
    expect(await landCollection.ownerOf(0)).to.equal(account1.address);
  });

  it("Should mint nft successfully", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection } = await loadFixture(buyLandFixture);

    await expect(nftCollection.safeMint(account2)).to.not.be.reverted;
    expect(await nftCollection.ownerOf(0)).to.equal(account2.address);
  });

  it("Should evolve failed due to insufficient ETH", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection } = await loadFixture(mintNFTFixture);

    await expect(evolveLand.connect(account2).evolveWithETH(0, nftCollection.target, 0)).to.be.revertedWith("Message value is not sufficient");
  });

  it("Should evolve successfully with sufficient ETH", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection } = await loadFixture(mintNFTFixture);

    await nftCollection.connect(account2).approve(evolveLand.target, 0);

    await expect(evolveLand.connect(account2).evolveWithETH(0, nftCollection.target, 0, {value: ETH_FEE})).to.not.be.reverted;
    expect(await nftCollection.ownerOf(0)).to.equal(await evolveLand.tbaOfLand(0));
  });

  it("Should evolve failed due to insufficient ERC20", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection } = await loadFixture(mintNFTFixture);

    await expect(evolveLand.connect(account2).evolveWithERC20(0, nftCollection.target, 0)).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Should evolve successfully with sufficient ERC20", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(mintNFTFixture);

    await erc20.mint(account2.address, ERC20_FEE);
    await erc20.connect(account2).approve(evolveLand, ERC20_FEE);
    await nftCollection.connect(account2).approve(evolveLand.target, 0);

    await expect(evolveLand.connect(account2).evolveWithERC20(0, nftCollection.target, 0)).to.not.be.reverted;
    expect(await nftCollection.ownerOf(0)).to.equal(await evolveLand.tbaOfLand(0));
  });

  it("Should withdraw ETH from TBA failed due to unauthorized", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(evolveNFTFixture);

    const tba = await ethers.getContractAt("ERC6551Account", await evolveLand.tbaOfLand(0));

    await expect(tba.execute(owner.address, ETH_FEE, "0x", 0)).to.be.revertedWith("Invalid signer");
  });


  it("Should withdraw ETH from TBA successfully", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(evolveNFTFixture);

    expect(await ethers.provider.getBalance(evolveLand.tbaOfLand(0))).to.equal(ETH_FEE);

    const tba = await ethers.getContractAt("ERC6551Account", await evolveLand.tbaOfLand(0));

    expect(tba.target).to.be.properAddress;

    const balanceBefore = await ethers.provider.getBalance(account1);

    await expect(tba.connect(account1).execute(account1.address, ETH_FEE, "0x", 0)).to.not.be.reverted;

    expect(await ethers.provider.getBalance(account1)).to.be.greaterThan(balanceBefore);
    expect(await ethers.provider.getBalance(evolveLand.tbaOfLand(0))).to.equal(0);
  });

  it("Should withdraw ERC20 from TBA failed due to unauthorized", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(evolveNFTFixture);

    const tba = await ethers.getContractAt("ERC6551Account", await evolveLand.tbaOfLand(0));

    const abi = ["function transfer(address to, uint256 amount)"];
    const inf = ethers.Interface.from(abi);
    const callData = inf.encodeFunctionData("transfer", [account1.address, ERC20_FEE]);

    await expect(tba.execute(erc20.target, 0, callData, 0)).to.be.revertedWith("Invalid signer");
  });

  it("Should withdraw ERC20 from TBA successfully", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(evolveNFTFixture);

    const tba = await ethers.getContractAt("ERC6551Account", await evolveLand.tbaOfLand(0));

    expect(await erc20.balanceOf(account1)).to.equal(0);

    const abi = ["function transfer(address to, uint256 amount)"];
    const inf = ethers.Interface.from(abi);
    const callData = inf.encodeFunctionData("transfer", [account1.address, ERC20_FEE]);

    await expect(tba.connect(account1).execute(erc20.target, 0, callData, 0)).to.not.be.reverted;

    expect(await erc20.balanceOf(account1)).to.equal(ERC20_FEE);
    expect(await erc20.balanceOf(await evolveLand.tbaOfLand(0))).to.equal(0);
  });

  it("Should withdraw ERC721 from TBA failed due to unauthorized", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(evolveNFTFixture);

    const tba = await ethers.getContractAt("ERC6551Account", await evolveLand.tbaOfLand(0));

    const abi = ["function transferFrom(address from, address to, uint256 tokenId)"];
    const inf = ethers.Interface.from(abi);
    const callData = inf.encodeFunctionData("transferFrom", [tba.target, account1.address, 0]);

    await expect(tba.execute(nftCollection.target, 0, callData, 0)).to.be.revertedWith("Invalid signer");
  });

  it("Should withdraw ERC721 from TBA successfully", async function(){
    const [ owner, account1, account2 ] = await ethers.getSigners();

    const { evolveLand, landCollection, nftCollection, erc20 } = await loadFixture(evolveNFTFixture);

    const tba = await ethers.getContractAt("ERC6551Account", await evolveLand.tbaOfLand(0));

    const abi = ["function transferFrom(address from, address to, uint256 tokenId)"];
    const inf = ethers.Interface.from(abi);
    const callData = inf.encodeFunctionData("transferFrom", [tba.target, account1.address, 0]);

    await expect(tba.connect(account1).execute(nftCollection.target, 0, callData, 0)).to.not.be.reverted;

    expect(await nftCollection.ownerOf(0)).to.equal(account1.address);
  });

})