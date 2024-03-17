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
import "./interfaces/IFeeManager.sol";
import "./interfaces/IDynamicV2.sol";
import "./interfaces/IDerivableV2.sol";

contract DataRegistryV2 is IDynamicV2, IDerivableV2, AccessControlUpgradeable,
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
  uint96 private constant MAXIMUM_ROYALTY_RATE = 10000;
  bytes private constant EMPTY_VALUE = "";
  bytes32 public constant WILDCARD_KEY = keccak256("*");
  
  address public factory;
  address public dapp;
  string public uri;
  uint256 private _nextTokenId;
  bool public disableComposable;
  bool public disableDerivable;
  
  // data scheme v2 - supported for write-batch
  mapping (bytes32 key => mapping (address collection => mapping (uint256 highId => mapping (uint256 lowId => bytes value)))) private _datas;
  mapping (bytes32 key => mapping (address collection => mapping (uint256 highId => uint256 lowId))) private _ranges;
  mapping (bytes32 key => mapping (address collection => uint256 topId)) private _tips;
  mapping (bytes32 key => mapping (address collection => mapping (uint256 currentId => uint256 nextId))) private _nodes;

  // derived NFT - supported for derive-by-keys
  mapping (bytes32 key => mapping (address underlyingCollection => mapping (uint256 underlyingTokenId => DerivedToken derivedToken))) private _derivatives;

  mapping (uint256 tokenId => Token underlying) private _underlyings;
  mapping (uint256 tokenId => address derivedAccount) private _derivedAccounts;
  mapping (uint256 tokenId => uint256 royaltyRate) private _royaltyRates;

  modifier onDerivable {
    require(!disableDerivable, "Derivable MUST be enable");
    _;
  }

  function initialize(address _dapp, address _factory, string calldata _uri, DataRegistrySettings calldata settings) external initializer {
    ERC721Upgradeable.__ERC721_init(REGISTRY_NAME, REGISTRY_SYMBOL);

    factory = _factory;
    dapp = _dapp;
    uri = _uri;
    _nextTokenId = 1;
    disableComposable = settings.disableComposable;
    disableDerivable = settings.disableDerivable;

    _grantRole(DEFAULT_ADMIN_ROLE, _dapp);
    _grantRole(WRITER_ROLE, _dapp);
  }

  function updateUri(string calldata _uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uri = _uri;
    emit URIUpdated(_uri);
  }

  // ====================================================
  //                    ERC721
  // ====================================================
  function burn(uint256 tokenId) public {
    require(_msgSender() == ownerOf(tokenId), "Sender MUST be owner of token");
    _burn(tokenId);
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
    return (IFactory(factory).derivedAccountOf(_underlyings[tokenId].collection, _underlyings[tokenId].tokenId), royaltyAmount);
  }

  // royalty denominator in terms of basis point
  function _feeDenominator() internal pure virtual returns (uint96) {
    return MAXIMUM_ROYALTY_RATE;
  }

  // ====================================================
  //                    DYNAMIC
  // ====================================================
  function writeBatch(address collection, uint256 startId, uint256 endId, bytes32 key, bytes calldata value) public payable onlyRole(WRITER_ROLE) {
    require(collection != address(0), "Collection MUST be valid");
    require(startId <= endId, "Start and End MUST be proper");
    require(collection != address(this), "Only underlying token can be written batch");

    if (_datas[key][collection][endId][startId].length > 0){
      // overwrite
      _writeBatch(collection, startId, endId, key, value);
      return;
    } 

    if (startId == 0) {
      require(_tips[key][collection] == 0 && _datas[key][collection][0][0].length == 0, "Range MUST not be overlapped");
    } else {
      require(startId > _tips[key][collection], "Range MUST not be overlapped");
    }

    _writeBatch(collection, startId, endId, key, value);
    _ranges[key][collection][endId] = startId;
    _insertNodes(key, collection, endId);
  }

  function write(address collection, uint256 tokenId, bytes32 key, bytes calldata value) public payable onlyRole(WRITER_ROLE) {
    require(collection != address(0), "Collection MUST be valid");
    require(_isUsableByKey(collection, tokenId, key), "Token MUST be usable at the moment");

    if (collection == address(this)) {
      return _writeDerived(tokenId, key, value);      
    } 
      
    return _write(collection, tokenId, key, value);
  }

  function writeBatchForSingleNFT(address collection, uint256 tokenId, bytes32[] calldata keys, bytes[] calldata values) public payable onlyRole(WRITER_ROLE) {
    require(collection != address(0), "Collection MUST be valid");
    require(keys.length == values.length, "Keys and values MUST be same length arrays");

    uint8 j;
    for (j=0; j<keys.length; j++) {
      require(_isUsableByKey(collection, tokenId, keys[j]), "Token MUST be usable at the moment");
    }

    j = 0;
    while (j<keys.length) {
      if (collection == address(this)) {
        _writeDerived(tokenId, keys[j], values[j]);
      } else {
        _write(collection, tokenId, keys[j], values[j]);
      }
      j++;
    }   
  }

  function _writeDerived(uint256 tokenId, bytes32 key, bytes memory value) private {
    Token memory underlying = _underlyings[tokenId];
    _write(underlying.collection, underlying.tokenId, key, value);
  }

  function _write(address collection, uint256 tokenId, bytes32 key, bytes memory value) private {
    (bool isFound, TokenRange memory range) = _findRange(key, collection, tokenId, _tips[key][collection]);

    if (!isFound) {
      _writeBatch(collection, tokenId, tokenId, key, value);
      _ranges[key][collection][tokenId] = tokenId;
      if (tokenId > _tips[key][collection]) {
        _nodes[key][collection][tokenId] = _tips[key][collection];
        _tips[key][collection] = tokenId;
      } else if (tokenId == _tips[key][collection]) { 
        return;  
      } else if (tokenId < range.end && tokenId > range.start){
        _nodes[key][collection][range.end] = tokenId;
        _nodes[key][collection][tokenId] = range.start;
      }
    } else {
      if (range.end == range.start) {
        _writeBatch(collection, tokenId, tokenId, key, value);
      } else {
        bytes memory currentValue = _datas[key][collection][range.end][range.start];
        uint256 next = _nodes[key][collection][range.end];

        _writeBatch(collection, tokenId, tokenId, key, value);
        _ranges[key][collection][tokenId] = tokenId;
        if (tokenId > range.start) {
          _nodes[key][collection][tokenId] = tokenId-1;

          _writeBatch(collection, range.start, tokenId-1, key, currentValue);
          _ranges[key][collection][tokenId-1] = range.start;
          _nodes[key][collection][tokenId-1] = next;
        }

        if (tokenId < range.end) {
          _writeBatch(collection, tokenId+1, range.end, key, currentValue);
          _ranges[key][collection][range.end] = tokenId+1;
          _nodes[key][collection][range.end] = tokenId;
        }
      }
    }
  }

  function _writeBatch(address collection, uint256 startId, uint256 endId, bytes32 key, bytes memory value) private {
    _datas[key][collection][endId][startId] = value;

    // emit events
    emit WriteBatch(collection, startId, endId, key, value);
  }

  function _insertNodes(bytes32 key, address collection, uint256 tokenId) private {
    if (tokenId > _tips[key][collection]) {
      _nodes[key][collection][tokenId] = _tips[key][collection];
      _tips[key][collection] = tokenId;
    } else if (tokenId == _tips[key][collection]) { 
      return;  
    } else {
      revert("Unsupported");
    }
  }

  function read(address collection, uint256 tokenId, bytes32 key) public view returns (bytes memory value) {
    if (collection == address(this)) {
      Token memory underlying = _underlyings[tokenId];
      return _read(underlying.collection, underlying.tokenId,key);
    }
    return _read(collection, tokenId, key);
  }

  function _read(address collection, uint256 tokenId, bytes32 key) private view returns (bytes memory value) {
    (bool isFound, TokenRange memory range) = _findRange(key, collection, tokenId, _tips[key][collection]);
    require(isFound , "Range data is not found");

    return _datas[key][collection][range.end][range.start];
  }

  function _findRange(bytes32 key, address collection, uint256 tokenId, uint256 top) private view returns (bool isFound, TokenRange memory range) {
    if (_datas[key][collection][tokenId][_ranges[key][collection][tokenId]].length > 0) {
      return (true, TokenRange(_ranges[key][collection][tokenId], tokenId));
    } else {
      if (tokenId > top) {
        return (false, TokenRange(top,tokenId));
      } else if (tokenId >= _ranges[key][collection][top]) {
        if (_datas[key][collection][top][_ranges[key][collection][top]].length > 0) {
          return (true, TokenRange(_ranges[key][collection][top], top));
        } else {
          return (false, TokenRange(_nodes[key][collection][top], top));
        }
      } else if (tokenId > _nodes[key][collection][top]) {
        return (false, TokenRange(_nodes[key][collection][top], top));
      } else {
        return _findRange(key, collection, tokenId, _nodes[key][collection][top]);
      }
    }
  }

  function tipOfKeyOnCollection(bytes32 key, address collection) public view returns (uint256) {
    return _tips[key][collection];
  }

  // ====================================================
  //                    DERIVABLE
  // ====================================================
  function derive(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate) 
    public payable onDerivable nonReentrant returns (uint256) {
    require(underlyingCollection != address(0), "Collection MUST be valid");

    bytes32[] memory keyHashes = new bytes32[](1);
    keyHashes[0] = WILDCARD_KEY;

    uint256 tokenId = _deriveByKeys(underlyingCollection, underlyingTokenId, startTime, endTime, royaltyRate, keyHashes);

    emit Derive(underlyingCollection, underlyingTokenId, address(this), tokenId, startTime, endTime);

    return tokenId;
  }

  function deriveByKeys(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate, bytes32[] calldata keyHashes) 
    public payable onDerivable nonReentrant returns (uint256 tokenId) {
    require(underlyingCollection != address(0), "Collection MUST be valid");

    tokenId = _deriveByKeys(underlyingCollection, underlyingTokenId, startTime, endTime, royaltyRate, keyHashes);

    return tokenId;
  }

  function _deriveByKeys(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate, bytes32[] memory keyHashes)
    private returns (uint256 tokenId) {
    assert(_canDerive(underlyingCollection, underlyingTokenId, startTime, endTime, royaltyRate, keyHashes));

    address derivedAccount;
    (tokenId, derivedAccount) = _createDerivedAccountAndMint(underlyingCollection, underlyingTokenId);

    for (uint8 j=0; j<keyHashes.length; j++) {
      _derivatives[keyHashes[j]][underlyingCollection][underlyingTokenId] = DerivedToken(address(this), tokenId, startTime, endTime);
    }

    _underlyings[tokenId] = Token(underlyingCollection, underlyingTokenId);
    _derivedAccounts[tokenId] = derivedAccount;
    _royaltyRates[tokenId] = royaltyRate;

    emit DeriveByKeys(underlyingCollection, underlyingTokenId, address(this), tokenId, startTime, endTime, keyHashes);

    return tokenId;
  }

  function _canDerive(address underlyingCollection, uint256 underlyingTokenId, uint256 startTime, uint256 endTime, uint256 royaltyRate, bytes32[] memory keyHashes)
    private view returns (bool) {
    require(underlyingCollection != address(this), "Only original NFT can be derived");
    require(IERC721(underlyingCollection).ownerOf(underlyingTokenId) == _msgSender(), "Sender MUST be owner of underlying token");
    require(startTime < endTime, "Start time MUST be before End time");
    require(royaltyRate <= _feeDenominator(), "The royalty rate MUST NOT exceed limit percentage");

    for (uint8 j=0; j<keyHashes.length; j++) {
      require(_isDerivableByKey(underlyingCollection, underlyingTokenId, keyHashes[j]), "Token MUST be derivable with requested keys");
    }

    return true;
  }

  function _createDerivedAccountAndMint(address underlyingCollection, uint256 underlyingTokenId) private returns (uint256 tokenId, address derivedAccount) {
    derivedAccount = IFactory(factory).createDerivedAccount(underlyingCollection, underlyingTokenId);

    tokenId = _nextTokenId++;
    _safeMint(_msgSender(), tokenId);    
    return (tokenId, derivedAccount);
  }

  function isDerivable(address collection, uint256 tokenId) public view onDerivable returns (bool) {
    return _isDerivableByKey(collection, tokenId, WILDCARD_KEY);
  }

  function isDerivableByKey(address collection, uint256 tokenId, bytes32 key) public view onDerivable returns (bool) {
    return _isDerivableByKey(collection, tokenId, key);
  }

  function _isDerivableByKey(address underlyingCollection, uint256 underlyingTokenId, bytes32 key) private view returns (bool) {    
    DerivedToken memory derived = _derivatives[key][underlyingCollection][underlyingTokenId];
    if (derived.collection == address(0)) {
      DerivedToken memory wildcardDerived = _derivatives[WILDCARD_KEY][underlyingCollection][underlyingTokenId];
      if (wildcardDerived.collection == address(0)) {
        return true;
      } else {
        if (wildcardDerived.endTime < block.timestamp) {
          return true;
        }
      }      
    } else if (derived.endTime < block.timestamp) {
      return true;
    } else if (_ownerOf(derived.tokenId) == address(0)) {
      // derived token is burned
      return true;
    }

    return false;
  }

  function derivedOf(address underlyingCollection, uint256 underlyingTokenId) public view onDerivable returns (DerivedToken memory derived) {
    require(underlyingCollection != address(0), "Collection MUST be valid");

    return _derivedByKeyOf(underlyingCollection, underlyingTokenId, WILDCARD_KEY);
  }

  function derivedByKeyOf(address underlyingCollection, uint256 underlyingTokenId, bytes32 key) public view onDerivable returns (DerivedToken memory derived) {
    require(underlyingCollection != address(0), "Collection MUST be valid");

    return _derivedByKeyOf(underlyingCollection, underlyingTokenId, key);
  }

  function _derivedByKeyOf(address underlyingCollection, uint256 underlyingTokenId, bytes32 key) private view returns (DerivedToken memory derived) {
    derived = _derivatives[key][underlyingCollection][underlyingTokenId];
    
    if (derived.collection == address(0)) {
      DerivedToken memory wildcardDerived = _derivatives[WILDCARD_KEY][underlyingCollection][underlyingTokenId];
      if (wildcardDerived.collection != address(0) && 
        block.timestamp >= wildcardDerived.startTime &&
        block.timestamp <= wildcardDerived.endTime) {
        return wildcardDerived;
      }
    }

    return derived;
  }

  function underlyingOf(uint256 derivedTokenId) public view onDerivable returns (address, uint256) {
    return (_underlyings[derivedTokenId].collection, _underlyings[derivedTokenId].tokenId);
  }

  function isUsable(address collection, uint256 tokenId) public view onDerivable returns (bool) {
    require(collection != address(0), "Collection MUST be valid");

    return _isUsableByKey(collection, tokenId, WILDCARD_KEY);
  }

  function isUsableByKey(address collection, uint256 tokenId, bytes32 key) public view onDerivable returns (bool) {
    require(collection != address(0), "Collection MUST be valid");

    return _isUsableByKey(collection, tokenId, key);
  }

  function _isUsableByKey(address collection, uint256 tokenId, bytes32 key) private view returns (bool) {
    DerivedToken memory derived;
    if (collection == address(this)) {
      // derived token
      Token memory underlying = _underlyings[tokenId];
      derived = _derivatives[key][underlying.collection][underlying.tokenId];

      if (derived.tokenId == tokenId && block.timestamp >= derived.startTime && block.timestamp <= derived.endTime) return true;

      DerivedToken memory wildcardDerived = _derivatives[WILDCARD_KEY][underlying.collection][underlying.tokenId];
      if (wildcardDerived.tokenId == tokenId && block.timestamp >= wildcardDerived.startTime && block.timestamp <= wildcardDerived.endTime) return true;

      return false;
    }

    derived = _derivatives[key][collection][tokenId];
    if (derived.collection == address(0)) {
      DerivedToken memory wildcardDerived = _derivatives[WILDCARD_KEY][collection][tokenId];
      if (wildcardDerived.collection == address(0)) {
        return true;
      } else if (block.timestamp < wildcardDerived.startTime || block.timestamp > wildcardDerived.endTime) {
        return true;
      }
      
      return false;
    }

    if (block.timestamp < derived.startTime || block.timestamp > derived.endTime) return true;
    return false;
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
      interfaceId == type(IERC2981).interfaceId ||
      interfaceId == type(IDynamicV2).interfaceId ||
      interfaceId == type(IDerivableV2).interfaceId;
  }
}