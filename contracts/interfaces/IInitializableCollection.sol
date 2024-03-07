// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IInitializableCollection {
  function initialize(address owner, string calldata name, string calldata symbol, bytes calldata settings) external;
}