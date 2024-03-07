// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IFreeMintable {
  function freeMint(address to) external payable returns (uint256);
}