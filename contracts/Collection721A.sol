// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";

import "./abstracts/AbstractCollection.sol";

import "./interfaces/IFactory.sol";
import "./interfaces/ISemiTransferable.sol";

contract Collection721A is AccessControlUpgradeable, AbstractCollection, ERC721AUpgradeable  {
  uint8 private constant FREE_MINT_QUANTITY = 1;

  mapping (uint256 tokenId => bool) private _locks;

  function initialize(address owner, string calldata name, string calldata symbol, bytes calldata settings) external override initializerERC721A initializer {
    factory = _msgSender();
    _owner = owner;

    ERC721AUpgradeable.__ERC721A_init(name, symbol);

    CollectionSettings memory cSettings = abi.decode(settings, (CollectionSettings));

    _setRoyaltyRate(cSettings.royaltyRate);

    _setSoulBound(cSettings.isSoulBound);
    _setFreeMintable(cSettings.isFreeMintable);
    _setSemiTransferable(cSettings.isSemiTransferable);

    _setAdminRoles(owner);
  }

  function _setAdminRoles(address owner) private {
    _grantRole(DEFAULT_ADMIN_ROLE, owner);
    _grantRole(MINTER_ROLE, owner);
  }

  function mintBatch(uint256 quantity) external onlyRole(MINTER_ROLE) payable {    
    _mint(msg.sender, quantity);
  }

  function mintBatchTo(address to, uint256 quantity) external onlyRole(MINTER_ROLE) payable {    
    _mint(to, quantity);
  }

  function nextTokenId() external view returns (uint256) {
    return _nextTokenId();
  }

  function burn(uint256 tokenId) public {
    require(_msgSender() == ownerOf(tokenId), "Sender MUST be owner of token");
    _burn(tokenId);
  }

  // ====================================================
  //                    ADD-ONS
  // ====================================================
  function _beforeTokenTransfers(
    address from,
    address to,
    uint256 startTokenId,
    uint256 quantity
  ) internal view override {
    if (from != address(0) && to != address(0)) {
      assert(!isSoulBound);
    } 
  }

  // ====================================================
  //                    IERC165
  // ====================================================
  function supportsInterface(bytes4 interfaceId)
    public
    view
    override (ERC721AUpgradeable, AccessControlUpgradeable, IERC165)
    returns (bool)
  {
      return 
        super.supportsInterface(interfaceId) ||
        interfaceId == type(IERC2981).interfaceId;
  }
}