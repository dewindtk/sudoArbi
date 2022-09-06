const fs = require(`fs`)
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);

async function main(){

    await updatePools(); // await once in case the update is big, such as the first time
    // setInterval(()=>updatePools(), 180000) //Update pool info every 3min. (make adjustable through cnfg)

}

//returns cnfg.json, if there is none will be created. Last Block inspected saved in cnfg.
async function readConfig(){ 
    try{    
        let cnfg = require(`./cnfg.json`);
        return cnfg;
    } catch (err){
        console.log("No cnfg file found, creating fresh one");
        cnfg = {"lastBlock": 0};
        await fs.promises.writeFile(`./cnfg.json`, JSON.stringify(cnfg), (errr) => {
        if (errr) {console.log(errr);}
        });
        return cnfg;
    }
}

//Updates cnfg.json
async function updateConfig(cnfg){ 
    await fs.promises.writeFile(`./cnfg.json`, JSON.stringify(cnfg), (errr) => {
        if (errr) {console.log(errr);}
    });
}

//Create & update pool info 
// think: seperat efunction to fetch events and to create pools?
//Maybe event file which is not yet in pools data? Buffer
async function updatePools(){
    let cnfg = await readConfig();
    let blockNow = await web3.eth.getBlockNumber();
    let events = [];
    let txs = []

    console.log("Updating pools.");
    console.log("Last saved Block is: ", cnfg.lastBlock);
    console.log("Now downloading remaining blocks until: ", blockNow);

    do{ //Fetch events, fetch txs, rename, merge, save into pools those merged.
        txs = await fetchTxsBtw(cnfg.lastBlock, 99999999)
        events = await fetchEventsBtw(cnfg.lastBlock, 99999999)
        merged = await mergeTxsEvents(txs, events); // returns [pools, lastBlock saved] WATCH OUT: blockNumber once number once hex.
        savePools(merged[0]);
        cnfg.lastBlock = merged[1];
        updateConfig(cnfg);
    } while(events.length > 0)

    //Arbi next

}


//returns [array of Event Objects, lastBlock tosave]
//Fetches events of NewPair btw Block A and B, maximum of 10000 Events.  
//Returns last block included null if no Events fetched.
async function fetchTxsBtw(blockA, blockB){
    url = `https://api.etherscan.io/api?module=account&action=txlist&address=0xb16c1342e617a5b6e4b631eb114483fdb289c0a4&startblock=${blockA}&endblock=${blockB}&page=1&offset=10&sort=asc&apikey=${process.env.ETHERSCANAPIKEY}`;
    response = await fetch(url);
    resJson = await response.json();
    txs = resJson.result;
    txs.filter(function(obj){
        return obj.methodId === "0xce9c095d"
    });
    lastBlock = (txs.length>0)? txs.at(-1).blockNumber : null;
    //Duplication avoidance.
    if(txs.length > 9700){
            txs = txs.filter(function( obj ) { // Possiblle efficiency improvement: search only couple last ones backwards until change.
            return obj.blockNumber !== lastBlock;  
        });
    }
    return txs;
}

async function fetchEventsBtw(blockA, blockB){
    url = `https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${blockA}&toBlock=${blockB}&topic0=0xf5bdc103c3e68a20d5f97d2d46792d3fdddfa4efeb6761f8141e6a7b936ca66c&page=1&offset=10000&apikey=${process.env.ETHERSCANAPIKEY}`;
    response = await fetch(url);
    resJson = await response.json();
    events = resJson.result;
    lastBlock = (events.length>0)? events.at(-1).blockNumber : null;
    //Duplication avoidance.
    if(events.length > 9700){
            events = events.filter(function( obj ) { // Possiblle efficiency improvement: search only couple last ones backwards until change.
            return obj.blockNumber !== lastBlock;  
        });
    }
    return events;
}

async function saveEventsIntoPools(events){
    //check if pools file existing, if not create format {nft: [pool1, pool2]}
    let pools;
    try{    
        pools = require(`./pools.json`);
    } catch (err){
        console.log("No pools file found, creating fresh one");
        pools = {};
        await fs.promises.writeFile(`./pools.json`, JSON.stringify(pools), (errr) => {
        if (errr) {console.log(errr);}
        });
    }
    for (eve of events){
        //Get contract address from input
        pools[`0x${eve.input.substring(34, 74)}`] = "ff"
        console.log(pools)
    }
}

main();


//Restructure everything - not Events but events with Create Pair ETH

