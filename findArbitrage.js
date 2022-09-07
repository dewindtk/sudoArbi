fs = require('fs')
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);

async function findArbitrage(collection){ //Consider FSM with State change commands
    let listings = await Promise.all(getOsListings(collection), getLrListings(collection), getXyListings(collection))
    let OsListings = listings[0]
    let LrListings = listings[1]
    let XyListings = listings[2]
    
}