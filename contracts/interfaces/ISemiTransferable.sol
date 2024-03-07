// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISemiTransferable {
  // events
  event Lock(address owner, uint256 tokenId);
  event Unlock(address owner, uint256 tokenId);

  // commands
  function lock(uint256 tokenId) external;
  function unlock(uint256 tokenId) external;

  // queries
  function isLocked(uint256 tokenId) external view returns (bool);
}