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
const args = require('args-parser')(process.argv) //Expect "collection", "gas"
const readline = require("readline");

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
async function findProfitableListing(listings, pools, args){
    pools = pools.sort((a,b) => -(a.outputAmount-b.outputAmount))
    listings = listings.sort((a,b) => (a.price-b.price))

    //TODO: args.gas. For this, Gas usage must be known. This is specific to Collection.
    //Simulation would be required.

    if (pools[0].outputAmount > listings[0].price){
        console.log("FOUND ARBI!!!!!!!!!!!!!!")
        console.log("Listing: ", listings[0], "Pool: ", pools[0])
        console.log(listings[0].object.asset.asset_contract.address, listings[0].token_id)
        const osSellQuote = await GET.getOSTokenIdSellQuote(listings[0].object.asset.asset_contract.address, listings[0].token_id)
        console.log("OSSELLQUOTE HERE: ", osSellQuote)
        if (osSellQuote.orders.length == 0){
            console.log("Too bad, this Item has already been sniped. Adding listing ID to blacklist.")
            await addCnfgBlacklist(listings[0].object.asset.id)
            return null
        }

        return [osSellQuote, pools[0]] //return OsSellquote here, keep in mind multiple listings, orders[0]
    }
    console.log("Arbi not found.\n")
    return null
}

async function createBundle(osTxData, parameters, poolAddy, sudoTxData, marketplace='OS'){
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
 
async function sendBundle(signedBundle){
    //Thx Kfish otherdeeds this is good copipe material
    const simulation = await flashbotsProvider.simulate(signedTransactions, targetBlock)
    if ('error' in simulation) {
      console.warn(`Simulation Error: ${simulation.error.message}`)
      process.exit(1)
    } else {
      console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`)
    }

    const bundleReceipt = await flashbotsProvider.sendRawBundle(
        signedBundle,
        TARGET_BLOCK_NUMBER
    );
    console.log('bundle submitted, waiting')
    if ('error' in bundleSubmission) {
      throw new Error(bundleSubmission.error.message)
    }
    const waitResponse = await bundleSubmission.wait()
    console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)
}

async function addCnfgBlacklist(id){
    let cnfg = await MEM.readConfig()
    if (!("blackList" in cnfg)){
        cnfg.blackList = []
    }
    cnfg.blackList.push(id)
    await MEM.updateConfig(cnfg)
}


async function main(){

    //TODO Think about: If using Setinterval, when inspecting listings already in memory and this is changed, what to do?
    //      ---->> Set ratio fetch/findArbi? Ask KFish.
    //TODO Error handling on every fetch pls

    //Save args in config for reusage
    let cnfg = await MEM.readConfig()
    for (arg of Object.keys(args)){
        cnfg.args[arg] = args[arg]
    }
    cnfg.blackList = []
    await MEM.updateConfig(cnfg)

    //Args parser
    if (!("collection" in args || "collection" in cnfg.args)){
        console.log("ERROR: Collection not specified")
        return;
    }
    cnfg.args.collection = ("collection" in args)? args.collection : cnfg.args.collection
    //Default gas 15 prio & max
    cnfg.args.gas = ("gas" in args)? args.gas : ("gas" in cnfg.args)? cnfg.args.gas : "15" //Gwei
    //Default loop interval 10sec
    cnfg.args.listloop = ("listloop" in args)? parseInt(args.listloop) : ("listloop" in cnfg.args)? cnfg.args.listloop : 0 //Milisecs  //TODO
    //Default listing fetch delta 1h
    cnfg.args.listdelta = ("listdelta" in args)? parseInt(args.listdelta) : ("listdelta" in cnfg.args)? cnfg.args.listdelta : 3600//Seconds //TODO

    const rl = readline.createInterface({input: process.stdin,output: process.stdout,});
    const question1 = () => {
        return new Promise((resolve, reject) => {
            rl.question("PLEASE CONFIRM ARGS", function (answer) {
                if (!(answer === 'y' || answer === 'yes' || answer === '')){process.exit(1)}
                resolve()
            });
        })
    }
    console.log("args: ", cnfg.args)
    await question1()
    rl.close

    let listings = []
    let osListings = []
    // await MEM.updatePools(); // await once in case the update is big, such as the first time

    while(true){
        arbi = null
        console.log("\nLooking for new arbi...")
        while (arbi === null){
            await MEM.updatePools();

            console.log("\nFetching OS listing Events")
            osListings = await GET.getOsEvents(cnfg.args.collection, cnfg.args.listdelta)
            console.log("Updating listings in Memory")
            listings = GET.concatListingsNoDuplicate(listings, osListings)
            listings = await GET.updateListings(listings) //[{market, token_id, price, expiration, object}]

            console.log("\nFetching collection pools Quotes")//Takes forever //Takes really forever
    //----> TODO A LOOOOTTT REJECTED. Proper error handling pls. Or faster Node or wateva
            pools = await GET.getPoolsQuotes(cnfg.args.collection) //[{addy, balance, outputAmount, newSpotPrice, newBalance},{},{}]
            if (pools == null){continue}
            // console.log("listing Events: ", listings) //[{market, token_id, price, expiration, listing_object},{},{}]
            // console.log("final pools: ", pools)

            console.log("\nChecking for arbi opportunity")
            arbi = await findProfitableListing(listings, pools, cnfg.args) //TODO: Include gas in calculation.
        }
    
        const osTxData = createOSTxData(arbi[0])
        const sudoTxData = createSudoTxData(arbi[1])
        const signedBundle = await createBundle(osTxData, arbi[0], sudoTxData, arbi[1], gas)
        const txReceipt = await sendBundle(signedBundle)
        console.log(txReceipt)
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