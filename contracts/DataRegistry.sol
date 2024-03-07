// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IFactory.sol";
import "./interfaces/IDynamic.sol";
import "./interfaces/IComposable.sol";
import "./interfaces/IDerivable.sol";

contract DataRegistry is IDynamic, IComposable, IDerivable, AccessControlUpgradeable, 
                          ERC721Upgradeable, IERC721Receiver, IERC2981, 
                          ReentrancyGuardUpgradeable {
  /**
   * @dev The registry MUST emit the URIUpdated event upon update dapp-uri successfully
   */
  event URIUpdated(string uri);

  using Address for address;

  // constants
  bytes32 public constant WRITER_ROLE = keccak256("WRITER_ROLE");
  string private constant REGISTRY_NAME = "NFT2.0 Registry";
  string private constant REGISTRY_SYMBOL = "NFT2.0";
  uint8 private constant MAX_SIZE_KEYS_COMPOSED = 10;
  uint8 private constant MAX_SIZE_WRITE_BATCH = 50;
  
  address private _factory;
  address public dapp;
  string public uri;
  uint256 private _nextTokenId;
  
  // registries
  mapping (address collection => mapping (uint256 tokenId => mapping (bytes32 key => bytes value))) private _registry;
  mapping (bytes32 key => string schema) private _schemas;
  mapping (address underlyingCollection => mapping (uint256 underlyingTokenId => DerivedToken derivedToken)) private _derivatives;
  mapping (uint256 tokenId => Token underlying) private _underlyings;
  mapping (uint256 tokenId => address derivedAccount) private _derivedAccounts;
  mapping (uint256 tokenId => uint256 royaltyRate) private _royaltyRates;

  function initialize(address _dapp, address factory, string calldata _uri) external initializer {
    ERC721Upgradeable.__ERC721_init(REGISTRY_NAME, REGISTRY_SYMBOL);

    _factory = factory;
    dapp = _dapp;
    uri = _uri;
    _nextTokenId = 1;

    _grantRole(DEFAULT_ADMIN_ROLE, _dapp);
    _grantRole(WRITER_ROLE, _dapp);
  }

  function updateUri(string calldata _uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uri = _uri;

    emit URIUpdated(_uri);
  }


  // ====================================================
  //                    ERC721Receiver
  // ====================================================
  function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public override pure returns (bytes4){
      return IERC721Receiver.onERC721Received.selector;
    }

  // ====================================================
  //                    ERC2981
  // ====================================================
  function royaltyInfo( 
        uint256 tokenId,
        uint256 salePrice
  ) external view returns (address receiver, uint256 royaltyAmount) {
    require(_underlyings[tokenId].collection != address(0), "Derived token MUST be valid");

    royaltyAmount = (salePrice * _royaltyRates[tokenId]) / _feeDenominator();
    return (IFactory(_factory).derivedAccountOf(_underlyings[tokenId].collection, _underlyings[tokenId].tokenId), royaltyAmount);
  }

  // royalty denominator in terms of basis point
  function _feeDenominator() internal pure virtual returns (uint96) {
    return 10000;
  }

  // ====================================================
  //                    DYNAMIC
  // ====================================================
  function write(address collection, uint256 tokenId, bytes32 key, bytes calldata value) public onlyRole(WRITER_ROLE) {
    return _writeSafe(collection, tokenId, key, value);
  }

  function safeWrite(address requester, address collection, uint256 tokenId, bytes32 key, bytes calldata value) 
    external onlyRole(WRITER_ROLE) {
    require(_requesterIsNFTOwner(requester, collection, tokenId), "Requester MUST be true owner of NFT");
    return _writeSafe(collection, tokenId, key, value);
  }

  function _writeSafe(address collection, uint256 tokenId, bytes32 key, bytes calldata value) private {
    require(_isUsable(collection, tokenId), "Token MUST be usable at the moment");

    if (collection == address(this)) {
      return _writeDerived(tokenId, key, value);
    }
      
    return _write(collection, tokenId, key, value);
  }


  function safeWriteBatchForSingleNFT(address requester, address collection, uint256 tokenId, bytes32[] calldata keys, bytes[] calldata values) 
    external onlyRole(WRITER_ROLE) {
    require(_requesterIsNFTOwner(requester, collection, tokenId), "Requester MUST be true owner of NFT");    
    require(keys.length == values.length, "Keys and values MUST be same length arrays");
    require(keys.length < MAX_SIZE_WRITE_BATCH, "Array length MUST not exceed limit");
    require(_isUsable(collection, tokenId), "Token MUST be usable at the moment");

    uint8 j;
    while (j<keys.length) {
      if (collection == address(this)) {
        _writeDerived(tokenId, keys[j], values[j]);
      } else {
        _write(collection, tokenId, keys[j], values[j]);
      }
      j++;
    }    
  }

  function writeBatchForMultipleNFTs(address collection, uint256[] calldata tokenIds, bytes32 key, bytes calldata value)
    external onlyRole(WRITER_ROLE) {
    require(tokenIds.length < MAX_SIZE_WRITE_BATCH, "Array length MUST not exceed limit");

    uint8 j;
    while (j<tokenIds.length) {
      if (collection == address(this)) {
        require(_isUsable(collection, tokenIds[j]), "Token MUST be usable at the moment");
        _writeDerived(tokenIds[j], key, value);
      } else {
        _write(collection, tokenIds[j], key, value);
      }
      j++;
    }
  }

  function _writeDerived(uint256 tokenId, bytes32 key, bytes memory value) internal {
    Token memory underlying = _underlyings[tokenId];
    
    _write(underlying.collection, underlying.tokenId, key, value);
  }

  function _write(address collection, uint256 tokenId, bytes32 key, bytes memory value) internal {
    _registry[collection][tokenId][key] = value;

    // emit onchain events
    emit Write(collection, tokenId, key, value);
  }

  function _requesterIsNFTOwner(address requester, address collection, uint256 tokenId) private view returns (bool) {
    if (requester == address(0)) return false;
    if (!collection.isContract()) return false;
    if (IERC721(collection).ownerOf(tokenId) != requester) return false;
    return true;
  }

  function read(address collection, uint256 tokenId, bytes32 key) public view returns (bytes memory) {
    require(_isUsable(collection, tokenId), "Token MUST be usable at the moment");

    if (collection == address(this)) {
      Token memory underlying = _underlyings[tokenId];
      return _registry[underlying.collection][underlying.tokenId][key];
    }
    return _registry[collection][tokenId][key];
  }

  // ====================================================
  //                    COMPOSABLE
  // ====================================================
  function compose(Token calldata srcToken, Token calldata descToken, bytes32[] calldata keyNames) external returns (bool){
    require(IERC721(srcToken.collection).ownerOf(srcToken.tokenId) == _msgSender(), "Sender MUST be owner of source token");
    require(IERC721(descToken.collection).ownerOf(descToken.tokenId) == _msgSender(), "Sender MUST be owner of destination token");
    require(srcToken.collection != address(this) && descToken.collection != address(this), "Derived token SHALL NOT be composable");

    uint j;
    while (j < keyNames.length) {
      _registry[descToken.collection][descToken.tokenId][keyNames[j]] = _registry[srcToken.collection][srcToken.tokenId][keyNames[j]];
      delete _registry[srcToken.collection][srcToken.tokenId][keyNames[j]];
      j++;
    }

    emit Compose(srcToken.collection, srcToken.tokenId, descToken.collection, descToken.tokenId, keyNames);

    return true;
  }

  // ====================================================
  //                    DERIVABLE
  // ====================================================
  function derive(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate) external nonReentrant returns (bool) {
    require(IERC721(underlyingCollection).ownerOf(underlyingTokenId) == _msgSender(), "Sender MUST be owner of underlying token");
    require(_isDerivable(underlyingCollection, underlyingTokenId), "Underlying token SHALL NOT derivable");
    require(startTime<endTime, "Start time MUST be before End time");
    require(royaltyRate <= _feeDenominator(), "The royalty rate MUST NOT exceed limit percentage");

    address derivedAccount = IFactory(_factory).createDerivedAccount(underlyingCollection, underlyingTokenId);

    uint256 tokenId = _nextTokenId++;
    _safeMint(_msgSender(), tokenId);

    _derivatives[underlyingCollection][underlyingTokenId] = DerivedToken(address(this), tokenId, startTime, endTime);
    _underlyings[tokenId] = Token(underlyingCollection, underlyingTokenId);
    _derivedAccounts[tokenId] = derivedAccount;
    _royaltyRates[tokenId] = royaltyRate;

    emit Derive(underlyingCollection, underlyingTokenId, address(this), tokenId, startTime, endTime);

    return false;
  }

  function reclaim(address underlyingCollection, uint256 underlyingTokenId) external returns (bool){
    require(_isReclaimable(_msgSender(), underlyingCollection, underlyingTokenId), "Token is not reclaimable");

    DerivedToken memory derived = _derivatives[underlyingCollection][underlyingTokenId];
    _burn(derived.tokenId);

    delete _derivatives[underlyingCollection][underlyingTokenId];
    delete _underlyings[derived.tokenId];

    emit Reclaim(underlyingCollection, underlyingTokenId, derived.collection, derived.tokenId);

    return false;
  }

  function isDerivable(address collection, uint256 tokenId) external view returns (bool) {
    return _isDerivable(collection, tokenId);
  }

  function isUsable(address collection, uint256 tokenId) external view returns (bool) {
    return _isUsable(collection, tokenId);
  }

  function isReclaimable(address requester, address collection, uint256 tokenId) external view returns (bool){
    return _isReclaimable(requester, collection, tokenId);
  }

  function _isDerivable(address underlyingCollection, uint256 underlyingTokenId) private view returns (bool) {
    DerivedToken memory derived = _derivatives[underlyingCollection][underlyingTokenId];
    if (derived.collection == address(0)) {
      return true;
    }

    return false;
  }

  function _isUsable(address collection, uint256 tokenId) private view returns (bool) {
    if (collection == address(this)) {
      // derived token
      Token memory underlying = _underlyings[tokenId];
      uint256 startTime = _derivatives[underlying.collection][underlying.tokenId].startTime;
      uint256 endTime = _derivatives[underlying.collection][underlying.tokenId].endTime;
      if (block.timestamp >= startTime && block.timestamp <= endTime) return true;
      return false;
    }

    DerivedToken memory derived = _derivatives[collection][tokenId];
    if (derived.collection == address(0)) return true;
    if (block.timestamp >= derived.startTime && block.timestamp <= derived.endTime) return false;
    return true;
  }

  function _isReclaimable(address requester, address collection, uint256 tokenId) private view returns (bool) {
    require(IERC721(collection).ownerOf(tokenId) == requester, "Requester MUST be owner of token");    
    require(collection != address(this), "Claimed token MUST be underlying");
    DerivedToken memory derived = _derivatives[collection][tokenId];
    require(derived.collection != address(0), "Claimed token MUST has derived");

    // if requester has also been owner of derived token then legitimate
    if (ownerOf(derived.tokenId) == requester) return true;

    // only claimable after derived time ends
    if (block.timestamp > derived.endTime) return true;

    return false;
  }

  function derivedOf(address underlyingCollection, uint256 underlyingTokenId) external view returns (DerivedToken memory) {
    return _derivatives[underlyingCollection][underlyingTokenId];
  }

  function underlyingOf(uint256 derivedTokenId) external view returns (address, uint256) {
    return (_underlyings[derivedTokenId].collection, _underlyings[derivedTokenId].tokenId);
  }

  // ====================================================
  //                    IERC165
  // ====================================================
  function supportsInterface(bytes4 interfaceId)
    public
    view
    override (ERC721Upgradeable, AccessControlUpgradeable, IERC165)
    returns (bool)
  {
    return 
      super.supportsInterface(interfaceId) ||
      interfaceId == 0x2a55205a || // IERC2981      
      interfaceId == 0xd212301b || // IDynamic
      interfaceId == 0x17e6e974 || // IComposable
      interfaceId == 0xd63e236c;   // IDerivable
  }
}