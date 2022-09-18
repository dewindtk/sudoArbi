fs = require('fs')
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const MEM = require('./updatePools.js')
const GET = require('./getListings.js')

async function main(){
    // get listings
    // get pools 

    await MEM.updatePools(); // await once in case the update is big, such as the first time
    setInterval(()=>MEM.updatePools(), 60000) //Update pool info every min. (make adjustable through cnfg)

    let listings = {}
    let osListings = await GET.getOsListings("0xed5af388653567af2f388e6224dc7c4b3241c544", 36000)
    listings = GET.addToListings(listings, [osListings])
    console.log("final: ", listings)
    //loop this upadte

    pools = await GET.getPoolsQuotes("0xed5af388653567af2f388e6224dc7c4b3241c544")
    console.log(pools)

    //Loop updateListings

    // find profitable trade 
    // create bundle 
    // send bundle 
    // see if successful and show profit
}

main();