// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "../helpers/DataStruct.sol";

abstract contract AbstractCollection is IERC2981 {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  uint96 private constant MAXIMUM_ROYALTY_RATE = 10000;

  address public factory;
  address internal _owner;
  uint96 internal _royaltyRate;

  bool public isSoulBound;
  FreeMintableKind public isFreeMintable;
  bool public isSemiTransferable;

  modifier onFreemint {
    require(isFreeMintable == FreeMintableKind.FREE_MINT_COMMUNITY 
            || isFreeMintable == FreeMintableKind.FREE_MINT_WHITELIST, "Freemint MUST be enable");
    _;
  }

  modifier onSemiTransferable {
    require(isSemiTransferable, "SemiTransferable MUST be enable");
    _;
  }

  function initialize(address owner, string calldata name, string calldata symbol, bytes calldata settings) external virtual;

  function _setSoulBound(bool enable) internal {
    isSoulBound = enable;
  }

  function _setFreeMintable(FreeMintableKind _type) internal {
    isFreeMintable = _type;
  }

  function _setSemiTransferable(bool enable) internal {
    isSemiTransferable = enable;
  }

  function _setRoyaltyRate(uint96 royaltyRate) internal {
    require(royaltyRate <= _feeDenominator(), "The royalty rate MUST NOT exceed limit percentage.");
    _royaltyRate = royaltyRate;
  }

  function royaltyInfo(uint256 tokenId, uint256 salePrice) public view virtual returns (address receiver, uint256 royaltyAmount) {
    royaltyAmount = (salePrice * _royaltyRate) / _feeDenominator();
    return (_owner, royaltyAmount);
  }

  // royalty denominator in terms of basis point
  function _feeDenominator() internal pure virtual returns (uint96) {
    return MAXIMUM_ROYALTY_RATE;
  }
}