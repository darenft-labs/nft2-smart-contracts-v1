// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "../interfaces/IInitializableCollection.sol";
import "../helpers/DataStruct.sol";

abstract contract AbstractCollection is IInitializableCollection, IERC2981 {
  address internal _owner;
  uint96 internal _royaltyRate;

  bool public isSoulBound;
  FreeMintableKind public isFreeMintable;
  bool public isSemiTransferable;

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
    return 10000;
  }
}