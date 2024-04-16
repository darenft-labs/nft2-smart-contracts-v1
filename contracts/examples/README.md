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

>   ERC6551 implementation address 0xDd97713FC5Cf4b59eC602422a030896029F05Abd
