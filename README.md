# NFT2.0 Protocol
Smart contracts for NFT2.0 Protocol, the universal WEB3 protocol for dynamic NFT, which achieves novel properties:
> - Dynamic - NFT data is stored onchain, hence immutable and ready for smart contracts logic.
> - Composable - ability to split or merge NFT values.
> - Derivable - ability to derive child (derivative) NFT from parent (underlying) NFT to use or rent out.

## Prerequisites
- [NodeJS v18.x](https://nodejs.org/en)
- [Hardhat v2.19.x](https://hardhat.org/)
- [OpenZeppelin v4.x](https://docs.openzeppelin.com/contracts/4.x/)

## Architecture
- [Class diagram](./docs/class-diagram.md)

- Main classes:
> 1. Factory: in charge of creating Data registries, NFT collections, Derived accounts, ERC6551 accounts. It also manages a self-registry in order to lookup all aforementioned entities.
> 2. DataRegistryV2: the smart contract template of data registry, which is used by the factory. The data registry would implement protocol interfaces: IDynamicV2, IDerivablesV2. The data registry is also in charge of creating the derived account, which essentially is a Token-bound-account (ERC6551) of underlying NFT, where the royalty commission will be accrued.
> 3. Collection: the smart contract template of NFT collection, which is used by the factory. The NFT collection would implement standard ERC721 interface and other extensions, which is included but not limited to: ERC2981 (royalty), Soul Bound Token, Free mint, etc. Collection also implements our proprietary interface Semi-Transferable.
> 4. DerivedAccount: Token bound account (ERC6551) for underlying NFT, which accrues royalty commission of derived NFT. We intentionally divert the royalty commission to derived account, in order to properly distribute royalty to both NFT owner (derived-NFT creator) and NFT creator. Anyone can claim royalty on derived account in a permissionless manner, provided that he pays sufficient gas, in this case, royalty commission will be distributed pro-rata to NFT owner and NFT creator.
> 5. Addons: addons for ERC721 collections, which is included but not limited to: Whitelisted freemint, etc.

## Setup
- Install npm dependencies
```bash
$ npm install
```

- Create .env file from template
```bash
$ cp .env.example .env
```

- Fulfill credentials and secrets to .env file

## Compile
- Compile smart contracts
```bash
$ npx hardhat compile
```

## Test
- Execute Unit tests
```bash
$ npx hardhat test
```

- Generate coverage report
```bash
$ npx hardhat coverage
```

## Assess codesize
- Check smart contract code size, in order to avoid breaking limit 24KB
```bash
$ npx hardhat size-contracts
```

## Audit
- Refer to [Audit Smart contracts](./audit/README.md) for details.

## Deploy
- (Hardhat local) Spin up local Hardhat node
```bash
$ npx hardhat node
```

- (Real networks) Add supported chain config to hardhat.config.ts
```typescript
const config: HardhatUserConfig = {
  networks: {
    bnb_testnet: {
      url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts: [privateKey1]
    },
  }
}
```

- Deploy implementation
```bash
$ IMPLEMENTATION=<kind> npx hardhat run ./scripts/deploy-implementation.ts --network <chain-name>
```
> *IMPLEMENTATION is the number kind, correspondingly:*
>
>   - 0: DataRegistry
>   - 1: Collection
>   - 2: DerivedAccount
>   - 3: Collection721A
>   - 4: DataRegistryV2
> *--network can be omitted in case deploy in-memory*

- AddonsManager
>   - Deploy AddonsManager
```bash
$ IMPLEMENTATION=5 npx hardhat run scripts/deploy-implementation.ts
```

>   - Upgrade AddonsManager
```bash
$ ADDONS_MANAGER=<address> \
IMPLEMENTATION=6 npx hardhat run scripts/deploy-implementation.ts
```

> *ADDONS_MANAGER is contract address, deployed in previous step.*

>   - Deploy & register strategy
```bash
$ ADDONS_MANAGER=<address> \
KIND=<addons-kind> \
IMPLEMENTATION=7 npx hardhat run scripts/deploy-implementation.ts
```

> *ADDONS_MANAGER is contract address, deployed in previous step.*
>
> *KIND is addons kind, correspondingly:*
>
>     - 0: Freemint whitelist FCFS
>     - 1: Freemint whitelist Fixed-token
>     - 2: Freemint whitelist Community


- Deploy factory
```bash
$ DATA_REGISTRY="<address>" \
COLLECTION="<address>" \
DERIVED_ACCOUNT="<address>" \
COLLECTION_721A="<address>" \
DATA_REGISTRY_V2="<address>" \
npx hardhat run scripts/deploy-factory.ts --network <chain-name>
```

> *DATA_REGISTRY, COLLECTION, DERIVED_ACCOUNT, COLLECTION_721A, DATA_REGISTRY_V2 is implementation contract addresses, deployed in previous step.*

- Config factory
>   - Set implementation to factory
```bash
$ FACTORY=<address> \
ACTION=1 \
KIND=<implementation-kind> \
IMPLEMENTATION=<new-implementation-address> \
npx hardhat run scripts/upgrade-factory.ts --network <chain-name>
```
> *KIND is implementation kind, defined above*

>   - Set AddonsManager
```bash
$ FACTORY=<address> \
ADDONS_MANAGER=<address> \
ACTION=0 \
npx hardhat run scripts/upgrade-factory.ts
```

> *FACTORY is factory contract address, deployed in previous step.*
> *ADDONS_MANAGER is contract address, deployed in previous step.*


## Verify contract
- Obtain and fulfill BSCScan / Snowtrace / etc API key to .env file
```bash
export BSCSCAN_API_KEY="<API_KEY>"
```

- Verify contract, notice to pass constructor arguments properly
```bash
$ npx hardhat verify <contract_address> --network <chain-name>
```

## (Optional) Verify contract on other chains
- [Klaytn](./docs/klaytn.md)

## Upgrade contracts
- (Optional) Deploy new implementation
```bash
$ IMPLEMENTATION=<number> npx hardhat run ./scripts/deploy-implementation.ts --network <chain-name>
```

- (Optional) Verify new implementation
```bash
$ npx hardhat verify <new-implementation-address> --network <chain-name>
```

- Upgrade factory contract
```bash
$ FACTORY="<address>" \
npx hardhat run ./scripts/upgrade-factory.ts --network <chain-name>
```

- Verify new factory implementation
```bash
$ npx hardhat verify <factory-address> --network <chain-name>
```

## Cleanup
- Cleanup smart contracts artifacts
```bash
$ npx hardhat clean
```

## Troubleshoot
- Deployment is sometimes failed due to networks congestion, the solution is needing to wait for traffic restabilize and redeploy.

## License
Copyright belongs to [DareNFT - Alpha Waves PTE. LTD](https://darenft.com/), 2023
