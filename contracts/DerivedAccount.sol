// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import "./interfaces/IFactory.sol";
import "./interfaces/IDerivedAccount.sol";
import "./interfaces/tokenbound/IERC6551Account.sol";

contract DerivedAccount is Initializable, IERC165, IERC1271, IERC6551Account, IDerivedAccount {
  uint8 private constant MAX_BATCH_SIZE = 10;
  uint256 public state;
  address public factory;

  receive() external payable {}

  function initialize(address _factory) external initializer {
    factory = _factory;
  }

  function claimRoyalty(address requestToken, uint256 amount) external payable {
    (uint256 chainId, address tokenContract, uint256 tokenId) = token();
    require(chainId == block.chainid, "ChainId MUST be valid");

    _claimRoyalty(tokenContract, tokenId, requestToken, amount);
  }

  function claimRoyaltyBatch(address[] calldata requestTokens, uint256[] calldata amounts) external payable {
    require(requestTokens.length == amounts.length, "Input array MUST be the same length");
    require(requestTokens.length <= MAX_BATCH_SIZE, "Input array MUST be less than limit");

    (uint256 chainId, address tokenContract, uint256 tokenId) = token();
    require(chainId == block.chainid, "ChainId MUST be valid");

    uint8 j;
    while (j<MAX_BATCH_SIZE && j<requestTokens.length){
      _claimRoyalty(tokenContract, tokenId, requestTokens[j], amounts[j]);
      j++;
    }
  }

  function _claimRoyalty(address tokenContract, uint256 tokenId, address requestToken, uint256 amount) private {    
    (address receiver, uint256 royaltyAmount) = IERC2981(tokenContract).royaltyInfo(tokenId, amount);
    uint256 remaining = amount - royaltyAmount;

    if (requestToken == address(0)) {
      // native token
      _claimNativeToken(receiver, royaltyAmount, IERC721(tokenContract).ownerOf(tokenId), remaining);
    } else {
      _claimERC20Token(requestToken, receiver, royaltyAmount, IERC721(tokenContract).ownerOf(tokenId), remaining);
    }
  }

  function _claimERC20Token(address reqToken, address receiver1, uint256 amount1, address receiver2, uint256 amount2) private {
    IERC20(reqToken).transfer(receiver1, amount1);
    IERC20(reqToken).transfer(receiver2, amount2);

    emit RoyaltyClaimed(receiver1, reqToken, amount1);
    emit RoyaltyClaimed(receiver2, reqToken, amount2);
  }

  function _claimNativeToken(address receiver1, uint256 amount1, address receiver2, uint256 amount2) private {
    (bool sent, bytes memory data) = receiver1.call{value: amount1}("");
    (sent, data) = receiver2.call{value: amount2}("");

    emit RoyaltyClaimed(receiver1, address(0), amount1);
    emit RoyaltyClaimed(receiver2, address(0), amount2);
  }

  function isValidSigner(address signer, bytes calldata) external view virtual returns (bytes4) {
    if (_isValidSigner(signer)) {
      return IERC6551Account.isValidSigner.selector;
    }

    return bytes4(0);
  }

  function _isValidSigner(address signer) internal view virtual returns (bool) {
    return signer == owner();
  }

  function isValidSignature(bytes32 hash, bytes memory signature)
    external
    view
    virtual
    returns (bytes4 magicValue)
  {
    return bytes4(0);
  }

  function owner() public view virtual returns (address) {
    (uint256 chainId, address tokenContract, uint256 tokenId) = token();
    if (chainId != block.chainid) return address(0);

    return IERC721(tokenContract).ownerOf(tokenId);
  }

  function token() public view virtual returns (uint256, address, uint256) {
    bytes memory footer = new bytes(0x60);
    assembly {
      extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
    }

    return abi.decode(footer, (uint256, address, uint256));    
  }

  // ====================================================
  //                    IERC165
  // ====================================================
  function supportsInterface(bytes4 interfaceId) external pure virtual returns (bool) {
    return interfaceId == type(IERC165).interfaceId
      || interfaceId == type(IERC6551Account).interfaceId
      || interfaceId == type(IDerivedAccount).interfaceId;
  }

}