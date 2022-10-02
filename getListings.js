// ALL DATES MUST BE IN UTC as Marketplaces use UTC
const fs = require('fs')
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const ethers = require('ethers')
const MEM = require('./updatePools.js')
const ethProvider = new ethers.providers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);


//Only normal listings for now
//Checks payment_token.address == 0x, price devided by payment_token.decimals, is_private == false
//BEFORE: returns {"token_id": [{market, price, expiration timestamp, listingObject}]}
//NOW: returns [{market, token_id, price, expiration, object}]
async function getOsEvents(contract, delta){
    const options = {
        method: 'GET',
        headers: {accept: 'application/json', 'X-API-KEY': process.env.OPENSEA_API_KEY}
    };
    responce = await fetch(`https://api.opensea.io/api/v1/events?asset_contract_address=${contract}&event_type=created&occurred_after=${Math.floor(Date.now()/1000)-delta}`, options)
    responce = await responce.json();
    listings = responce.asset_events
    listings = listings.filter(function(obj){ //Only public listings and payments with ETH
        return obj.is_private == false && obj.payment_token.address === "0x0000000000000000000000000000000000000000"
    });
    // console.log(listings) //[{asset: {token_id: 1234}}]

    result = []
    for (obj of listings){
        iprice = parseFloat(web3.utils.fromWei(obj.starting_price))
        iexp = Math.round(new Date(`${obj.listing_time}z`).valueOf()/1000 + parseInt(obj.duration))
        result.push({"market": "OS", "token_id": obj.asset.token_id, "price": iprice, "expiration": iexp,"object": obj})
    }
    return result
}

function concatListingsNoDuplicate(arr1, arr2){
    let result = (arr1.length>arr2.length)? arr1: arr2
    for (item of (arr1.length>arr2.length)? arr2:arr1){
        if (typeof result.find(obj => obj.object.id === item.object.id) == 'undefined'){
            result.push(item)
        }
    }
    return result
}

//Removes inactive listings
async function updateListings(listings){
    dateNow = Math.round(new Date(new Date().toISOString()).valueOf()/1000)
    console.log("datenow: ", dateNow)
    let cnfg = await MEM.readConfig()
    for (bl in cnfg.blackList){
        listings = listings.filter(obj => obj.object.asset.id != bl)
        console.log("This listing is in the Blacklist", bl)
    }
    return listings.filter(obj => obj.expiration > dateNow)
}

async function getOSTokenIdSellQuote(contract, tokenId){
    const options = {
        method: 'GET',
        headers: {accept: 'application/json', 'X-API-KEY': process.env.OPENSEA_API_KEY}
      };
      
    responce = await fetch(`https://api.opensea.io/v2/orders/ethereum/seaport/listings?asset_contract_address=${contract}&token_ids=${tokenId}&order_by=created_date`, options)
    responce = await responce.json()
    responce.orders = responce.orders.sort((a,b) => (a.current_price - b.current_price))
    return responce;
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

    let outputAmount = web3.utils.fromWei(result[3].toString())   //ERROR HANDLING IN EVERY FETCH?
    outputAmount = parseFloat(outputAmount)

    let newSpotPrice = web3.utils.fromWei(result[1].toString())
    newSpotPrice = parseFloat(newSpotPrice)

    let fee = web3.utils.fromWei(result[4].toString())
    fee = parseFloat(fee)

    let newBalance = balance - outputAmount - fee
    return {"pairContract": pairContract, "balance": balance, "outputAmount": outputAmount, "newSpotPrice": newSpotPrice, "newBalance": newBalance}
}

async function getPoolsQuotes(collection){
    const pools = require('./pools.json') //error handling
    let myPools = []
    if (!(collection in pools)){
        console.log("No pools for this contract");
        return null
    }
    myPools = pools[collection]
    let prmses = []
    for (const pool of myPools){
        prmses.push(getPoolSellQuote(pool))
    }
    result = await Promise.allSettled(prmses)
    // console.log("potential error HERE: ", result)
    result2 = result.map(function(obj){
        return obj.value
    })

    return filterEmptyPoolsSort(result2) //[{},{},{}]
}

//Filters out inactive pools (maybe save in seperate monitor array) and then sort by profitability
//Input: [{addy, balance, outputAmount, newSpotPrice, newBalance}]
function filterEmptyPoolsSort(pools){
    pools = pools.filter(obj => (typeof obj)!=='undefined')
    pools = pools.filter(obj => obj.newBalance > 0)//Think of proper error handling of UNDEFINED ASK KFISH
    //Adjust maybe slighly below 0?
    return pools
}

//Add multiple collection support tho this outside current functions
// async function main(){

//     let listings = {}
//     let osListings = await getOsEvents("0xed5af388653567af2f388e6224dc7c4b3241c544", 36000)
//     listings = addToListings(listings, [osListings])
//     console.log("final: ", listings)
//     //loop this upadte

//     pools = await getPoolsQuotes("0xed5af388653567af2f388e6224dc7c4b3241c544")
//     console.log(pools)

//     //Loop updateListings
// }
// main();

//TODO draw plan of action into same steps for both pools and listings for better org
//TODO make arrays disctionaries for organization


module.exports = {
    getOsEvents,
    updateListings,
    getPoolsQuotes,
    getOSTokenIdSellQuote,
    concatListingsNoDuplicate,
}