// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IERC721Mintable.sol";

interface IFreeMintCommunityStrategy {
  /**
    * @dev The freeMinter MUST emit the FreeMint event upon successful claiming.
    */
  event FreeMint(address receiver, uint256 amount);

  /**
    * @dev Freemint
    *   
    * Emits FreeMint event.
    * @param amount number to mint
    */
  function freeMint(uint256 amount) external payable;

  /**
   * @dev Returns id hash of campaign   
   */
  function campaignId() external view returns (bytes32 id);

  /**
   * @dev Returns claimable amount by wallet
   * @param receiver wallet address
   */
  function claimableAmount(address receiver) external view returns (uint256);
}