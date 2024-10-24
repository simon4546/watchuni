const { Contract, Web3 } = require('web3');
const moment = require('moment-timezone');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const web3 = new Web3('wss://mainnet.infura.io/ws/v3/6e6a3c3e676b4ab1ad7a7126b70169e9');
//wss://base-mainnet.infura.io/ws/v3/6e6a3c3e676b4ab1ad7a7126b70169e9
//wss://arbitrum-mainnet.infura.io/ws/v3/6e6a3c3e676b4ab1ad7a7126b70169e9
//wss://optimism-mainnet.infura.io/ws/v3/6e6a3c3e676b4ab1ad7a7126b70169e9
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
// Uniswap V2 Router and Pair contract addresses
const UNISWAP_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
// const UNISWAP_ROUTER_ABI = fs.readFileSync("./router.json", { "encoding": 'utf8', "flag": "r" });
const UNISWAP_ROUTER_ABI = JSON.parse(fs.readFileSync("./router.json"), "utf8");
const ERC20_ABI = JSON.parse(fs.readFileSync("./erc20.json"), "utf8");
//swapExactETHForTokens swapExactETHForTokensSupportingFeeOnTransferTokens  swapExactTokensForTokensSupportingFeeOnTransferTokens
//swapTokensForExactTokens swapETHForExactTokens swapExactTokensForTokens

const SWAP_EXACT_ETH_FOR_TOKENS_SIGNATURE = "0x7ff36ab5";
const SWAP_EXACT_ETH_OR_TOKENS_SUPPORTING_FEE_ON_TRANSFER_TOKENS_SIGNATURE = "0xb6f9de95";
const SWAP_EXACT_TOKENS_FOR_TOKENS_SUPPORTING_FEE_ON_TRANSFER_TOKENS_SIGNATURE = "0x5c11d795";

const timeZone = 'Asia/Shanghai';
// SQLite database
const db = new sqlite3.Database('./uniswap_trades1.db');

// 初始化数据库
db.run(`CREATE TABLE IF NOT EXISTS uniswap_trades (
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
        if (tx.to && tx.to.toLowerCase() === UNISWAP_ROUTER_ADDRESS.toLowerCase() && (
            tx.input.startsWith(SWAP_EXACT_ETH_FOR_TOKENS_SIGNATURE) ||
            tx.input.startsWith(SWAP_EXACT_ETH_OR_TOKENS_SUPPORTING_FEE_ON_TRANSFER_TOKENS_SIGNATURE) ||
            tx.input.startsWith(SWAP_EXACT_TOKENS_FOR_TOKENS_SUPPORTING_FEE_ON_TRANSFER_TOKENS_SIGNATURE)
        )) {
            console.log("-----------------------------------------------------")
            console.log(`Incoming swap transaction: ${tx.hash}`);
            console.log(`From: ${tx.from}`);
            handleRouter(tx)
            console.log("-----------------------------------------------------")
        }
    })
}
async function handleRouter(tx) {
    const decoded = contract.decodeMethodData(tx.input);
    const tokenAddress = decoded.path.at(-1)
    const token0Address = decoded.path.at(0)
    const method = decoded.__method__
    let value = web3.utils.fromWei(tx.value, "ether")
    const erc20 = new web3.eth.Contract(ERC20_ABI, tokenAddress);
    const tokenName = await erc20.methods.symbol().call()
    if (method.startsWith('swapExactETHForTokens') || method.startsWith('swapExactETHForTokensSupportingFeeOnTransferTokens')) {
        console.log(method, value, tokenAddress, tokenName);
        await processSwapEvent(tx.hash, tx.from, tokenAddress, tokenName, value, "")
    }
    if (method.startsWith('swapExactTokensForTokensSupportingFeeOnTransferTokens') && tokenName != "WETH") {
        value = web3.utils.fromWei(decoded.amountIn, "ether")
        console.log(method, tokenAddress, tokenName);
        await processSwapEvent(tx.hash, tx.from, tokenAddress, tokenName, value, "")
    }
    
}
subscribeToNewBlocks();

async function processSwapEvent(tx, sender, token1, token1Name, amount0, amount1) {
    const currentTime = moment.tz(timeZone).format('YYYY-MM-DD HH:mm:ss');
    db.run(`INSERT INTO uniswap_trades (tx,sender,  token1,token1Name, amount0, amount1,timestamp) VALUES (?,?, ?, ?, ?, ?,?)`,
        [tx, sender, token1, token1Name, amount0, amount1, currentTime],
        function (err) {
            if (err) {
                console.error("Database insert error:", err);
            } else {
                console.log("Trade saved to database.");
            }
        });
}