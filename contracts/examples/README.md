# Vesting Voucher
A hypothesis use-case for leveraging NFT2.0 Protocol.

## Utils
- Create voucher
```
$ npx hardhat create --contract <voucher-address> \
  --balance <ethers-amount> \
  --schedules <json-encoded-vesting-schedules> \
  --network <network-name>
```
>  - *Prerequisites:* signer must approve voucher contract at least *ethers-amount* beforehand
>  - *IMPORTANT:* the vesting schedules is a json encoded string, with all amount values in Ethers unit, in order to avoid overflow while decoding, for example:
```
--schedules "[{\"amount\":\"1000000\",\"vestingType\":2,\"linearType\":0,\"startTimestamp\":1698828908,\"endTimestamp\":0,\"isVested\":0,\"remainingAmount\":\"0\"},{\"amount\":\"5000000\",\"vestingType\":1,\"linearType\":1,\"startTimestamp\":1700038508,\"endTimestamp\":1731660908,\"isVested\":0,\"remainingAmount\":\"5000000\"}]"
```

## Create TBA
*In order to create TBA, please use configuration for each chain below*
- AVAX testnet

>   Factory address 0xf4943e8cC945071C778EE25ad0BE5857eD638556

>   ERC6551 implementation address 0xFc1615AC9a96E42dd3B1C3d4205e326a40B1C197

- AVAX mainnet

>   Factory address 0x34A4ac15dcAA1f498ca405a4d6C3aEc8108600b8

>   ERC6551 implementation address 0x23A170f47E77e3a9D2516f2fB16BBD9adb10b27D

- BNB testnet

>   Factory address 0x702067e6010E48f0eEf11c1E06f06aaDb04734e2

>   ERC6551 implementation address 0x43374E79b833634735309118B93F7716A8b2085c

- BNB mainnet

>   Factory address 0x75fc4ABf45d38176544833164e4E870B1A5E3103

>   ERC6551 implementation address 0x751Ac0dc32234A1a42DE9c5F6C02deb46A3fa4d8

