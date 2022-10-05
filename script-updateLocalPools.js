const fs = require(`fs`)
const Web3 = require(`web3`)
require("dotenv").config();
const web3 = new Web3(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);

//Create & update pool.json 
async function updatePools(){
    let cnfg = await readConfig();
    let blockNow = await web3.eth.getBlockNumber();
    let events = [];
    let txs = []
    let merged

    console.log("Updating pools.");
    console.log("Last saved Block is: ", cnfg.lastBlock);
    console.log("Now downloading remaining blocks (if any) until: ", blockNow);

    do{ //Fetch events, fetch txs, rename, merge, save into pools those merged.
        //Have to fetch both Txs and Events as nft contract info only in tx and pool contract info only in event. 
        //TODO Make fetchTxs and Events return lastBlock and compare lastBlock to BlockNow, will eliminate last call. <--??? do not remember what was meant here
        txs = await fetchTxsBtw(parseInt(cnfg.lastBlock)+1, blockNow)
        events = await fetchEventsBtw(parseInt(cnfg.lastBlock)+1, blockNow)
        if(events.length != 0){
            merged = await mergeTxsEvents(txs, events); 
            await savePools(merged[0]);
            cnfg.lastBlock = (merged[1]!=null)? merged[1]: cnfg.lastBlock;
            await updateConfig(cnfg);
        }
    } while(events.length > 0)
}

//@return cnfg.json, if there is none will be created. Last Block inspected saved in cnfg.
async function readConfig(){ 
    try{    
        let cnfg = require(`./DATA-cnfg.json`);
        return cnfg;
    } catch (err){
        console.log("No cnfg file found, creating fresh one");
        cnfg = {"lastBlock": 0};
        await fs.promises.writeFile(`./DATA-cnfg.json`, JSON.stringify(cnfg), (errr) => {
        if (errr) {console.log(errr);}
        });
        return cnfg;
    }
}

//@param cnfg json
//Updates cnfg.json
async function updateConfig(cnfg){ 
    await fs.promises.writeFile(`./DATA-cnfg.json`, JSON.stringify(cnfg), (errr) => {
        if (errr) {console.log(errr);}
    });
}

//returns txs of the sudo pairFactory contract btw blockA and blockB, max of 10000
//@param blocks, any
//@return txs Object from API call
async function fetchTxsBtw(blockA, blockB){
    url = `https://api.etherscan.io/api?module=account&action=txlist&address=0xb16c1342e617a5b6e4b631eb114483fdb289c0a4&startblock=${blockA}&endblock=${blockB}&page=1&offset=10000&sort=asc&apikey=${process.env.ETHERSCANAPIKEY}`;
    response = await fetch(url);
    resJson = await response.json();
    txs = resJson.result;
    txs = txs.filter(function(obj){
        return obj.methodId === "0xce9c095d"
    });
    //Duplication avoidance.
    if(txs.length > 9700){
            lastBlock = txs.at(-1).blockNumber;
            txs = txs.filter(function( obj ) { // Possiblle efficiency improvement: search only couple last ones backwards until change.
            return obj.blockNumber !== lastBlock;  
        });
    }
    return txs;
}

//returns events of createPair btw blockA and blockB, max of 10000
//@param blocks, any
//@return events Object from API call
async function fetchEventsBtw(blockA, blockB){
    url = `https://api.etherscan.io/api?module=logs&action=getLogs&fromBlock=${blockA}&toBlock=${blockB}&topic0=0xf5bdc103c3e68a20d5f97d2d46792d3fdddfa4efeb6761f8141e6a7b936ca66c&page=1&offset=10000&apikey=${process.env.ETHERSCANAPIKEY}`;
    response = await fetch(url);
    resJson = await response.json();
    events = resJson.result;
    //Duplication avoidance.
    if(events.length > 9700){
            lastBlock = events.at(-1).blockNumber;
            events = events.filter(function( obj ) { // Possiblle efficiency improvement: search only couple last ones backwards until change.
            return obj.blockNumber !== lastBlock;  
        });
    }
    return events;
}

//Merged txs and pools into pools.json
//@param txs object
//@param events object
//@return [pools.json, lastBlock saved] 
async function mergeTxsEvents(txs, events){
    let pools;
    try{    
        pools = require(`./DATA-pools.json`);
    } catch (err){
        console.log("No pools file found, creating fresh one");
        pools = {};
        await fs.promises.writeFile(`./DATA-pools.json`, JSON.stringify(pools), (errr) => {
        if (errr) {console.log(errr);}
        });
    }
    let lastBlock = null
    for (var i=0;i<txs.length;i++){ //make it stop when eve not found anymore?
        eve = events.find(item => item.transactionHash.toLowerCase() === txs[i].hash.toLowerCase());
        if (eve !== undefined){
            if (`0x${txs[i].input.substring(34, 74)}` in pools){
                pools[`0x${txs[i].input.substring(34, 74)}`] = [...pools[`0x${txs[i].input.substring(34, 74)}`], `0x${eve.data.substring(26)}`];
            } else {
                pools[`0x${txs[i].input.substring(34, 74)}`] = [`0x${eve.data.substring(26)}`];
            }
            lastBlock = txs[i].blockNumber
            console.log(`Pool added: 0x${eve.data.substring(26)}`)
        }
    }
    return [pools, lastBlock];
}

//Save pools into file
//@param pools json
async function savePools(pools){
    await fs.promises.writeFile(`./DATA-pools.json`, JSON.stringify(pools, null, 2), (errr) => {
        if (errr) {console.log(errr);}
    });
}

module.exports = {
    updatePools,
    updateConfig,
    readConfig,
}


