// ALL DATES MUST BE IN UTC as Marketplaces use UTC
const fs = require('fs')
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const ethers = require('ethers')
const ethProvider = new ethers.providers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);


//Only normal listings for now
//Checks payment_token.address == 0x, price devided by payment_token.decimals, is_private == false
//returns {"token_id": [{market, price, expiration timestamp, listingObject}]} price is in BN
async function getOsListings(contract, delta){
    const options = {
        method: 'GET',
        headers: {accept: 'application/json', 'X-API-KEY': 'cc1343daeb6b494fa7d51a6c9badf767'}
    };
    responce = await fetch(`https://api.opensea.io/api/v1/events?asset_contract_address=${contract}&event_type=created&occurred_after=${Math.floor(Date.now()/1000)-delta}`, options)
    responce = await responce.json();
    listings = responce.asset_events
    listings = listings.filter(function(obj){ //Only public listings and payments with ETH
        return obj.is_private == false && obj.payment_token.address === "0x0000000000000000000000000000000000000000"
    });
    // console.log(listings) //[{asset: {token_id: 1234}}]

    result = {}
    for (obj of listings){
        iprice = parseFloat(web3.utils.fromWei(obj.starting_price))
        iexp = Math.round(new Date(`${obj.listing_time}z`).valueOf()/1000 + parseInt(obj.duration))
        try{
            result[obj.asset.token_id].push({"market": "OS", "price": iprice, "expiration": iexp, "object": obj})
        }catch(err){
            result[obj.asset.token_id] = [{"market": "OS", "price": iprice, "expiration": iexp,"object": obj}]
        }
    }
    return result
}

//Input: listings = {tokenid: [{market, price, obj}]}
//osLrXy an array of listing arrays.
function addToListings(listings, osLrXy){
    if(osLrXy.length!=1){
        for(const markt of osLrXy){
            listings = addToListings(listings, markt)
        }
        return listings
    }

    toAdd = osLrXy[0]
    for(const [key, value] of Object.entries(toAdd)){ //CAREFUL value here is an array of customListing obj
        for (customList of value){
            try{
                listings[key].push(customList)
            }catch(err){
                listings[key] = [customList]
            }
        }

    }
    listings = updateListings(listings)
    return listings
}

//pls test
function updateListings(listings){
    dateNow = Math.round(new Date(new Date().toISOString()).valueOf()/1000)
    console.log("datenow: ", dateNow)
    for(const [token_id, lists] of Object.entries(listings)){
        listings[token_id] = lists.filter(function(obj){ //Only public listings and payments with ETH
            return obj.expiration > dateNow
        });
        if (listings[token_id].length == 0){
            delete listings[token_id]
        }
    }
    return listings
}

// Too many web3 Calls. Slow. TODO make utils calculations yourself.
// returns addy, balance, outputAmount, newSpotPrice, newBalance
async function getPoolSellQuote(pairContract){
    const abi = ["function getSellNFTQuote(uint256) external view returns (string, uint256, uint256, uint256, uint256)"]
    const contract = new ethers.Contract(pairContract, abi, ethProvider)
    const result = await contract.getSellNFTQuote(1); //error, newSpotPrice, newDelta, outputAmount, protocolFee

    let balance = await web3.eth.getBalance(pairContract)
    balance = web3.utils.fromWei(balance)
    balance = parseFloat(balance)

    let outputAmount = web3.utils.fromWei(result[3].toString())
    outputAmount = parseFloat(outputAmount)

    let newSpotPrice = web3.utils.fromWei(result[1].toString())
    newSpotPrice = parseFloat(newSpotPrice)

    let fee = web3.utils.fromWei(result[4].toString())
    fee = parseFloat(fee)

    let newBalance = balance - outputAmount - fee
    return [pairContract, balance, outputAmount, newSpotPrice, newBalance]
}

async function getPoolsQuotes(){
    let pools = require('./pools.json') //error handling
    let myPools = []
    try{
        myPools = pools["0xed5af388653567af2f388e6224dc7c4b3241c544"]
    }
    catch(err){
        console.log("No pools for this contract");
        return
    }
    let prmses = []
    for (const pool of myPools){
        prmses.push(getPoolSellQuote(pool))
    }
    result = await Promise.allSettled(prmses)
    result = result.map(function(obj){
        return obj.value //[addy, balance, outputAmount, newSpotPrice, newBalance]
    })
    return filterEmptyPoolsSort(result)
}

//Filters out inactive pools (maybe save in seperate monitor array) and then sort by profitability
//Input: [[addy, balance, outputAmount, newSpotPrice, newBalance]]
function filterEmptyPoolsSort(pools){
    pools = pools.filter(obj => obj[4]>0) //Adjust maybe slighly below 0?
    return pools.sort((a,b) => -(a[2]-b[2]))
}

//Add multiple collection support tho this outside current functions
async function main(){

    let listings = {}
    let osListings = await getOsListings("0xed5af388653567af2f388e6224dc7c4b3241c544", 36000)
    listings = addToListings(listings, [osListings])
    console.log("final: ", listings)
    //loop this upadte

    pools = await getPoolsQuotes("0xed5af388653567af2f388e6224dc7c4b3241c544")
    console.log(pools)

    //Loop updateListings
}
// main();

//TODO draw plan of action into same steps for both pools and listings for better org
//TODO make arrays disctionaries for organization


module.exports = {
    getOsListings,
    addToListings,
    getPoolsQuotes,
}