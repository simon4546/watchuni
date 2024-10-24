const { Contract, Web3 } = require('web3');
const moment = require('moment-timezone');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const web3 = new Web3('wss://mainnet.infura.io/ws/v3/6e6a3c3e676b4ab1ad7a7126b70169e9');
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
const UNISWAP_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const UNISWAP_ROUTER_ABI = JSON.parse(fs.readFileSync("./router.json"), "utf8");
const ERC20_ABI = JSON.parse(fs.readFileSync("./erc20.json"), "utf8");

const timeZone = 'Asia/Shanghai';
// SQLite database
const db = new sqlite3.Database('./uniswap_trades1.db');

// 初始化数据库
db.run(`CREATE TABLE IF NOT EXISTS freq_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    token1 TEXT,
    token1Name TEXT,
    amount0 TEXT,
    amount1 TEXT,
    tx TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const contract = new web3.eth.Contract(UNISWAP_ROUTER_ABI, UNISWAP_ROUTER_ADDRESS);

async function subscribeToNewBlocks() {
    const subscription = await web3.eth.subscribe('newBlockHeaders');
    subscription.on('data', handleNewBlock);
}
async function handleNewBlock(blockHeader) {
    console.log(`Got new block: ${blockHeader.number}`);
    const block = await web3.eth.getBlock(blockHeader.number, true);
    block.transactions.forEach((tx) => {
        if (tx.to && tx.to.toLowerCase() == '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'.toLowerCase()) {
            let value = web3.utils.fromWei(tx.value, "ether")
            if (value > 0.3) {
                web3.eth.getCode(tx.to).then((message) => {
                    let isContract = message
                    if (isContract != "0x") {
                        console.log("-----------------------------------------------------")
                        // console.log(`Incoming swap transaction: ${tx.hash}`);
                        // console.log(`From: ${tx.from},From: ${tx.to} transaction: ${tx.hash}`);
                        handleRouter(tx)
                        // console.log("-----------------------------------------------------")
                    }
                    // console.log(message);	// 성공(resolve)한 경우 실행
                })
            }
        }
    })
}
//Universal Router
async function handleRouter(tx) {
    if (tx.input.length < 1500) return;
    let method = tx.input.substring(266, 274)
    let coin = tx.input.substring(1378, 1418)
    if (method == '0b080604') {
        let value = web3.utils.fromWei(tx.value, "ether")
        let address = `0x${coin}`
        const erc20 = new web3.eth.Contract(ERC20_ABI, address);
        const tokenName = await erc20.methods.symbol().call()
        console.log(tokenName, address)
        await processSwapEvent(tx.hash, tx.from, address, tokenName, 0, value)
    }
}
subscribeToNewBlocks();

async function processSwapEvent(tx, sender, token1, token1Name, amount0, amount1) {
    const currentTime = moment.tz(timeZone).format('YYYY-MM-DD HH:mm:ss');
    db.run(`INSERT INTO freq_trades (tx,sender,token1,token1Name, amount0, amount1,timestamp) VALUES (?,?, ?, ?, ?, ?,?)`,
        [tx, sender, token1, token1Name, amount0, amount1, currentTime],
        function (err) {
            if (err) {
                console.error("Database insert error:", err);
            } else {
                console.log("Trade saved to database.");
            }
        });
}