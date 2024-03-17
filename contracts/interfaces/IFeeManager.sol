// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../helpers/DataStruct.sol";

interface IFeeManager {
  /**
   * @dev the fee manager MUST emit SetFee event upon setting successful.   
   */
  event SetFee(ProtocolAction action, uint256 fee);

  /**
   * @dev set Protocol fee for corresponding action.
   * 
   * @param action action kind, e.g.: write, derive, claim royalty, etc
   * @param fee action fee in wei 
   */
  function setFee(ProtocolAction action, uint256 fee) external;

  /**
   * @dev Returns fee of action in wei
   * 
   * @param action action kind
   */
  function getFee(ProtocolAction action) external view returns (uint256);

  /**
   * @dev Returns receiver of fee
   *    
   */
  function getReceiver() external view returns (address);  
}