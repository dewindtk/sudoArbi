fs = require('fs')
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");

async function main(){
    // get listings
    // get pools 
    // find profitable trade 
    // create bundle 
    // send bundle 
    // see if successful and show profit
}

main();