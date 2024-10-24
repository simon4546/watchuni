const { ethers } = require("ethers");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const INFURA_URL = 'https://mainnet.infura.io/v3/6e6a3c3e676b4ab1ad7a7126b70169e9'; // 替换为你的Infura项目ID

const provider = new ethers.JsonRpcProvider(INFURA_URL);

const UNISWAP_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const UNISWAP_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

const UNISWAP_FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const UNISWAP_PAIR_ABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

const ERC20_ABI = [
    "function symbol() external view returns (string)"
];

const UNISWAP_ROUTER_ABI = [
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"
];

const uniswapRouterContract = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ABI, provider);
const uniswapFactoryContract = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, provider);

const dbPath = path.resolve(__dirname, 'uniswap_trades.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS uniswap_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            token0 TEXT,
            token1 TEXT,
            amount0In TEXT,
            amount1In TEXT,
            amount0Out TEXT,
            amount1Out TEXT,
            recipient TEXT,
            timestamp INTEGER
        )
    `);
});

async function getTokenSymbol(tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    try {
        return await tokenContract.symbol();
    } catch (err) {
        console.error(`Error fetching symbol for token: ${tokenAddress}`, err);
        return null;
    }
}

uniswapRouterContract.on('Swap', async (sender, amount0In, amount1In, amount0Out, amount1Out, to, event) => {
    const timestamp = Math.floor(Date.now() / 1000);

    const pairAddress = event.address;  // Swap事件触发的合约地址即为Pair合约地址
    const pairContract = new ethers.Contract(pairAddress, UNISWAP_PAIR_ABI, provider);

    const token0Address = await pairContract.token0();
    const token1Address = await pairContract.token1();

    const token0Symbol = await getTokenSymbol(token0Address);
    const token1Symbol = await getTokenSymbol(token1Address);

    const formattedAmount0In = ethers.utils.formatUnits(amount0In);
    const formattedAmount1In = ethers.utils.formatUnits(amount1In);
    const formattedAmount0Out = ethers.utils.formatUnits(amount0Out);
    const formattedAmount1Out = ethers.utils.formatUnits(amount1Out);

    console.log(`New Swap detected!`);
    console.log(`Sender: ${sender}`);
    console.log(`Token0: ${token0Symbol} (${token0Address})`);
    console.log(`Token1: ${token1Symbol} (${token1Address})`);
    console.log(`Amount In (Token0): ${formattedAmount0In}`);
    console.log(`Amount In (Token1): ${formattedAmount1In}`);
    console.log(`Amount Out (Token0): ${formattedAmount0Out}`);
    console.log(`Amount Out (Token1): ${formattedAmount1Out}`);
    console.log(`To: ${to}`);

    db.run(`
        INSERT INTO uniswap_trades (sender, token0, token1, amount0In, amount1In, amount0Out, amount1Out, recipient, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sender, token0Symbol, token1Symbol, formattedAmount0In, formattedAmount1In, formattedAmount0Out, formattedAmount1Out, to, timestamp],
        (err) => {
            if (err) {
                return console.error("Failed to insert trade into database:", err.message);
            }
            console.log("Trade successfully recorded in the database.");
        });
});

process.on('SIGINT', () => {
    db.close(() => {
        console.log("Database connection closed.");
        process.exit(0);
    });
});
