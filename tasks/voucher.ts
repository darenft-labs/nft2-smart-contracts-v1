import { task, types } from "hardhat/config";

type Schedule = {
  amount: string,
  vestingType: number,
  linearType: number,
  startTimestamp: number,
  endTimestamp: number,
  isVested: number,
  remainingAmount: string,
};

task("create", "Create vesting voucher")
  .addParam("contract", "The voucher contract address")
  .addParam("balance", "The total balance of voucher")
  .addParam("schedules", "Vesting schedules in form of JSON encoded string")
  .setAction(async (taskArgs, hre) => {
    // create voucher for account2, in order to be ensure permissionless
    const [owner, signer] = await hre.ethers.getSigners();

    console.log(`Create voucher for ${signer.address} with balance ${taskArgs.balance}`);
    
    // decode schedules from command line arguments
    const schedules : Schedule[] = JSON.parse(taskArgs.schedules);
    //console.log(`Vesting schedules input`, schedules);

    // convert amount ethers to wei
    let ethSchedule : any[] = [];

    schedules.forEach(async item => {
      ethSchedule.push({
        amount: hre.ethers.parseEther(item.amount),
        vestingType: item.vestingType,
        linearType: item.linearType,
        startTimestamp: item.startTimestamp,
        endTimestamp: item.endTimestamp,
        isVested: item.isVested,
        remainingAmount: hre.ethers.parseEther(item.remainingAmount),
      })
    });

    console.log(`Vesting schedules`, ethSchedule);

    const voucher = await hre.ethers.getContractAt("Voucher", taskArgs.contract);

    const vesting = {
      balance: hre.ethers.parseEther(taskArgs.balance),
      schedules: ethSchedule
    };
    const tx = await voucher.connect(signer).create(vesting);
    const receipt = await tx.wait();

    console.log(`Create new voucher for ${signer.address} successfully with tx hash ${receipt?.hash}`);
  });