// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/IDynamicV2.sol";
import "../interfaces/tokenbound/IERC6551Registry.sol";

import "../../contracts/Collection.sol";
import "../../contracts/tokenbound/ERC6551Account.sol";

contract EvolveLand is Ownable, IERC721Receiver {
  bytes32 private constant _SALT = keccak256("evolve-land");
  uint256 public constant LAND_PRICE = 10 ** 17;

  address private _landCollection;
  uint256 private _ethFee;

  uint256 private _erc20Fee;
  address private _erc20FeeToken;

  address private _factory;
  address private _tbaImplementation;

  mapping (address => mapping (uint256 => bool)) public isEvolved;

  constructor(address landCollection, uint256 ethFee, uint256 erc20Fee, address erc20FeeToken, address factory, address tbaImplementation) Ownable() {
    _landCollection = landCollection;
    _ethFee = ethFee;
    _erc20Fee = erc20Fee;
    _erc20FeeToken = erc20FeeToken;

    _factory =  factory;
    _tbaImplementation = tbaImplementation;
  }

  receive() external payable {}

  fallback() external payable {}

  function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public override returns (bytes4){
      return IERC721Receiver.onERC721Received.selector;
    }

  function buyLand() public payable returns (uint256 tokenId, address tba) {
    require(msg.value >= LAND_PRICE, "Message value is not sufficient");

    // mint new voucher
    tokenId = Collection(_landCollection).safeMint(msg.sender);

    // create TBA
    bytes32 salt = keccak256(abi.encode(address(this), _landCollection, tokenId, _SALT));
    tba = IERC6551Registry(_factory).createAccount(
      _tbaImplementation,
      salt,
      block.chainid,
      _landCollection,
      tokenId
      );
  }

  function tbaOfLand(uint256 tokenId) public view returns (address tba) {
    bytes32 salt = keccak256(abi.encode(address(this), _landCollection, tokenId, _SALT));
    return IERC6551Registry(_factory).account(
      _tbaImplementation,
      salt,
      block.chainid,
      _landCollection,
      tokenId
    );
  }

  function evolveWithETH(uint256 landTokenId, address collection, uint256 tokenId) public payable {
    require(msg.value >= _ethFee, "Message value is not sufficient");
    require(!isEvolved[collection][tokenId], "NFT is evolved already");

    isEvolved[collection][tokenId] = true;

    address tba = this.tbaOfLand(landTokenId);
    (bool sent, bytes memory data) = tba.call{value: msg.value}("");
    IERC721(collection).safeTransferFrom(msg.sender, tba, tokenId);
  }

  function evolveWithERC20(uint256 landTokenId, address collection, uint256 tokenId) public {
    require(!isEvolved[collection][tokenId], "NFT is evolved already");

    isEvolved[collection][tokenId] = true;

    address tba = this.tbaOfLand(landTokenId);
    IERC20(_erc20FeeToken).transferFrom(msg.sender, tba, _erc20Fee);
    IERC721(collection).safeTransferFrom(msg.sender, tba, tokenId);
  }
  
}