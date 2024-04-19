// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISemiTransferable {
  /**
   * @dev The collection MUST emit the Lock event upon successful locking.
   */
  event Lock(address owner, uint256 tokenId);

  /**
   * @dev The collection MUST emit the LockWithTime event upon successful locking with time.
   */
  event LockWithTime(address owner, uint256 tokenId, uint256 startTime, uint256 endTime);

  /**
   * @dev The collection MUST emit the Unlock event upon successful unlocking.
   */
  event Unlock(address owner, uint256 tokenId);

  /**
   * @dev Lock NFT instantly
   * 
   * @param tokenId tokenId of NFT
   */
  function lock(uint256 tokenId) external;

  /**
   * @dev Lock NFT within a period of time
   * 
   * @param tokenId tokenId of NFT
   * @param endTime locking end timestamp
   */
  function lockWithTime(uint256 tokenId, uint256 endTime) external;

  /**
   * @dev Unlock NFT instantly
   * 
   * @param tokenId tokenId of NFT
   */
  function unlock(uint256 tokenId) external;

  /**
   * @dev Returns locking status of NFT
   * 
   * @param tokenId tokenId of NFT
   */
  function isLocked(uint256 tokenId) external view returns (bool);
}