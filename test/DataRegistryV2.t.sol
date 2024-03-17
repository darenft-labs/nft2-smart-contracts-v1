// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "forge-std/Test.sol";

contract DataRegistryV2Test is Test {
  uint256 testNumber;

  function setUp() public {
    testNumber = 42;
  }

  function test_NumberIs42() public {
    assertEq(testNumber, 42);
  }

  function testFail_Subtract43() public {
    testNumber -= 43;
  }

  function test_NumberNot40() public {
    assertNotEq(testNumber, 40);
  }
}