// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract Collection1155 is AccessControlUpgradeable, ERC1155Upgradeable {
  uint256 public _nextTokenId;
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  uint96 private constant MAXIMUM_ROYALTY_RATE = 10000;
  uint96 internal _royaltyRate;

  address public factory;
  address internal _owner;

  function initialize(address owner, string calldata uri) external initializer {
    factory = _msgSender();
    _owner = owner;    

    ERC1155Upgradeable.__ERC1155_init(uri);

    _setAdminRoles(owner);
  }

  function _setAdminRoles(address owner) private {
    _grantRole(DEFAULT_ADMIN_ROLE, owner);
    _grantRole(MINTER_ROLE, owner);
  }

  function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
    tokenId = _nextTokenId ++;
    _mint(to, tokenId, amount, "");
  }

  // ====================================================
  //                    IERC165
  // ====================================================
  function supportsInterface(bytes4 interfaceId)
    public
    view
    override (ERC1155Upgradeable, AccessControlUpgradeable)
    returns (bool)
  {
      return 
        super.supportsInterface(interfaceId);
  }
}