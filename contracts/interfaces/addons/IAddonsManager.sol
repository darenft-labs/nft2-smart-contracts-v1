// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAddonsManager {
  enum AddonsKind {
    FREE_MINT_WHITELIST_FCFS,
    FREE_MINT_WHITELIST_FIXED_TOKEN
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
   * @dev check if strategy implementation is whitelisted
   * @param strategy contract address
   * @return boolean
   */
  function isWhitelistedStrategy(address strategy) external returns (bool);

  /**
   * @dev lookup strategy by kind
   * @param kind addons kind
   * @return address
   */
  function strategyOfKind(uint8 kind) external returns (address);
}