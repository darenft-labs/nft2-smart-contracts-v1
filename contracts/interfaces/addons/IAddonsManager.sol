// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAddonsManager {
  enum AddonsKind {    
    FREE_MINT_WHITELIST_FCFS,
    FREE_MINT_WHITELIST_FIXED_TOKEN,
    FREE_MINT_COMMUNITY
  }

  /**
    * @dev The AddonsManager MUST emit the RegisterStrategy event upon successful registration.
    */
  event RegisterStrategy(address strategy, uint8 kind);

  /**
   * @dev register strategy implementation with kind
   * @param strategy contract address
   * @param kind kind of addons
   */
  function registerStrategy(address strategy, uint8 kind) external;
  
  /**
   * @dev Returns bool indicates that strategy implementation is whitelisted
   * @param strategy contract address
   */
  function isWhitelistedStrategy(address strategy) external view returns (bool);

  /**
   * @dev Returns address of strategy implementation
   * @param kind addons kind   
   */
  function strategyOfKind(uint8 kind) external view returns (address);
}