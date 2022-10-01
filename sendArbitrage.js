const fs = require('fs')
const ethers = require('ethers')
const ethProvider = new ethers.providers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const MEM = require('./updatePools.js')
const GET = require('./getListings.js')
const toHex = web3.utils.toHex

function completeLeft(str){
    console.log(str)
    str = str.replace('0x', '')
    while(str.length < 64){
        str = `0${str}`
    }
    console.log(str.length)
    return str.toLowerCase()
}

function complete64(str){
    str = str.replace('0x', '')
    const toLen = Math.ceil(str.length/64)
    console.log("str: ", str)
    console.log("toLen: ", toLen)
    while (str.length != 64*toLen){
        str = str.concat("0")
    }
    return str.toLowerCase()
}

function createOSTxData(listing){
    let basicOrderParameters = {
        "considerationToken": '0x',
        "considerationIdentifier": `0x`,
        "considerationAmount": listing.orders[0].protocol_data.parameters.consideration[0].endAmount,
        "offerer": listing.orders[0].protocol_data.parameters.offerer,
        "zone": listing.orders[0].protocol_data.parameters.zone,
        "offerToken": listing.orders[0].protocol_data.parameters.offer[0].token,
        "offerIdentifier": listing.orders[0].protocol_data.parameters.offer[0].identifierOrCriteria, //check that not more than 1
        "offerAmount": 1,
        "basicOrderType": listing.orders[0].protocol_data.parameters.orderType,
        "startTime": listing.orders[0].protocol_data.parameters.startTime,
        "endTime": listing.orders[0].protocol_data.parameters.endTime,
        "zoneHash": listing.orders[0].protocol_data.parameters.zoneHash,
        "salt": listing.orders[0].protocol_data.parameters.salt,
        "offererConduitKey": listing.orders[0].protocol_data.parameters.conduitKey,
        "fulfillerConduitKey": listing.orders[0].protocol_data.parameters.conduitKey,
        "totalOriginalAdditionalRecipients": listing.orders[0].maker_fees.length,
        "additionalRecipients": listing.orders[0].protocol_data.parameters.consideration,
        "signature":listing.orders[0].protocol_data.signature,
        "current_price": listing.orders[0].current_price,
    }
    
    let txData = `0xfb0f3ee1` + "0000000000000000000000000000000000000000000000000000000000000020"
        + `${completeLeft(basicOrderParameters.considerationToken)}` //has to be ETH
        + `${completeLeft(basicOrderParameters.considerationIdentifier)}`
        + `${completeLeft(toHex(basicOrderParameters.considerationAmount))}`
        + `${completeLeft(basicOrderParameters.offerer)}`
        + `${completeLeft(basicOrderParameters.zone)}`
        + `${completeLeft(basicOrderParameters.offerToken)}`
        + `${completeLeft(toHex(basicOrderParameters.offerIdentifier))}`
        + `${completeLeft(toHex(basicOrderParameters.offerAmount))}` //has to be 1
        + `${completeLeft(toHex(basicOrderParameters.basicOrderType))}` //has to be 2
        + `${completeLeft(toHex(basicOrderParameters.startTime))}`
        + `${completeLeft(toHex(basicOrderParameters.endTime))}`
        + `${completeLeft(basicOrderParameters.zoneHash)}`
        + `${completeLeft(basicOrderParameters.salt)}`
        + `${completeLeft(basicOrderParameters.offererConduitKey)}`
        + `${completeLeft(basicOrderParameters.fulfillerConduitKey)}`
        + `${completeLeft(toHex(basicOrderParameters.totalOriginalAdditionalRecipients))}`
        + `0000000000000000000000000000000000000000000000000000000000000240`
        + `00000000000000000000000000000000000000000000000000000000000002e0`;

    const additionalRecips = basicOrderParameters.additionalRecipients.filter(obj => obj.recipient.toLowerCase() !== basicOrderParameters.offerer.toLowerCase())
    txData = txData + `${completeLeft(toHex(additionalRecips.length))}`
    for (recip of additionalRecips){
        txData = txData + `${completeLeft(toHex(recip.endAmount))}`
        txData = txData + `${completeLeft(recip.recipient)}`
    }

    txData = txData + `${completeLeft(toHex((basicOrderParameters.signature.length-2)/2))}`
        + `${complete64(basicOrderParameters.signature)}`

    return {
        "txData": txData.toLowerCase(),
        "parameters": basicOrderParameters};
}

/*
    offset = ...000a0
    uint256 minexpectedOutput
    address recipient
    bool ...00000
    address ...00000
    Size of TokenIDs (in this case 0001)
    uint256 tokenid
 */

function createSudoTxData(inputData){//require Object {minExpectedOutputAmount, recipient, tokenId}
    //swapNFTsForToken(uint256[],uint256,address,bool,address)
    let txData = '0xb1d3f1c1'
        + `${completeLeft('a0')}`
        + `${completeLeft(toHex(inputData.minExpectedOutputAmount))}`
        + `${completeLeft(inputData.recipient)}`
        + `${completeLeft('0')}`
        + `${completeLeft('0')}`
        + `${completeLeft('1')}`
        + `${completeLeft(toHex(inputData.tokenId))}`

    return txData
}

//returns [listed tokenID, pool addy] if found, else null
async function findProfitableListing(listings, pools){
    pools = pools.sort((a,b) => -(a.outputAmount-b.outputAmount))
    listings = listings.sort((a,b) => (a.price-b.price))
    if (pools[0].outputAmount > listings[0].price){
        const osSellQuote = await GET.getOSTokenIdSellQuote(listings[0].object.asset.asset_contract.address, listings[0].token_id)
        return [osSellQuote, pools[0]] //return OsSellquote here, keep in mind multiple listings, orders[0]
    }
    return null
}

async function createFBBundle(osTxData, parameters, poolAddy, sudoTxData, marketplace='OS'){
    const authSigner = new ethers.Wallet(`${process.env.FB_AUTH_KEY}`);
    const wallet3 = new ethers.Wallet(`${process.env.WALLET_PRIV_KEY}`)
    const nonce3 = web3.eth.getTransactionCount(wallet3.address)
    let market = 'OS'

    switch(marketplace){
        case 'OS':
            market = '0x00000000006c3852cbef3e08e8df289169ede581'
            break;
        case 'LR':
            break;
        case 'XY':
            break;
    }

    const flashbotsProvider = await FlashbotsBundleProvider.create(
        provider,
        authSigner
    );

    const tx_buy_from_marketplace = {
        'from': wallet3,
        'to': market,
        'value': parameters.current_price,
        'gas': 'Number',
        'type': '2',
        'maxFeePerGas': '40',
        'maxPriorityFeePerGas': '10',
        'data': osTxData,
        'nonce': nonce3,
    }

    const tx_sell_to_sudoPool = {
        'from': wallet3,
        'to': poolAddy,
        'value': '0',
        'gas': 'Number',
        'type': '2',
        'maxFeePerGas': '40',
        'maxPriorityFeePerGas': '10',
        'data': sudoTxData,
        'nonce': nonce3 + 1,
    }

    console.log("buy FB tx: ", tx_buy_from_marketplace)
    console.log("sell FB tx: ", tx_sell_to_sudoPool)

    const signedBundle = await flashbotsProvider.signBundle(
    [
        {
            signer: wallet3,
            transaction: tx_buy_from_marketplace,
        },
        {
            signer: wallet3,
            transaction: tx_sell_to_sudoPool,
        },
    ]);

    return signedBundle
}
 
async function sendFBBundle(signedBundle){
    const bundleReceipt = await flashbotsProvider.sendRawBundle(
        signedBundle,
        TARGET_BLOCK_NUMBER
    );
    return bundleReceipt
}



async function main(){

    await MEM.updatePools(); // await once in case the update is big, such as the first time
    // setInterval(()=>MEM.updatePools(), 180000) //Update pool info every min. (make adjustable through cnfg)

    let listings = []
    let osListings = await GET.getOsEvents("0xed5af388653567af2f388e6224dc7c4b3241c544", 72000)
    listings = listings.concat(osListings)
    listings = GET.updateListings(listings)
    console.log("listing Events: ", listings) //[{token_id, market, price, expiration, listing_object},{},{}]
    //loop this upadte

    pools = await GET.getPoolsQuotes("0xed5af388653567af2f388e6224dc7c4b3241c544") //[{addy, balance, outputAmount, newSpotPrice, newBalance},{},{}]
    console.log("final pools: ", pools)

    arbi = await findProfitableListing(listings, pools); //TODO //returns WListing, WPool

    if (arbi !== null){
        const osTxData = createOSTxData()
        const sudoTxData = createSudoTxData()
        const signedBundle = await createFBBundle(osTxData, arbi[0], sudoTxData, arbi[1])
        // const txReceipt = await sendFBBundle(signedBundle)
        console.log(txReceipt)
    }
    else {
        console.log("No arbi found")
    }

    // const listingA = await GET.getOSTokenIdSellQuote("0xedf6d3c3664606fe9ee3a9796d5cc75e3b16e682", 4165)
    // await fs.promises.writeFile(`./listingA.json`, JSON.stringify(listingA, null, 2), (errr) => {
    //     if (errr) {console.log(errr);}
    // });
    // const A = require('./listingA.json')
    // console.log(createOSTxData(A))

    // create bundle 
    // send bundle 
    // see if successful and show profit
}

main();