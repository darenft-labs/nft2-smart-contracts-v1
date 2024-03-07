// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IDerivedAccount {
  // events
  event RoyaltyClaimed(address receiver, address requestToken, uint256 amount);

  // commands
  function claimRoyalty(address requestToken, uint256 amount) external;
}