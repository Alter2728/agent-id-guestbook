// End-to-end test of the real frontend (docs/index.html + config.js + app.js)
// against a local Anvil chain, using jsdom and a mock EIP-1193 wallet.
// Usage: node e2e/run.mjs
// Requires: an Anvil instance on http://127.0.0.1:8545 with the contracts
// deployed (see broadcast/Deploy.s.sol/31337/run-latest.json).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { ethers } from "ethers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANVIL_URL = "http://127.0.0.1:8545";
// Anvil default account #0 (public test key, local only).
const HOLDER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const STRANGER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const broadcast = JSON.parse(
  fs.readFileSync(path.join(ROOT, "broadcast/Deploy.s.sol/31337/run-latest.json"), "utf8")
);
const contracts = {};
for (const t of broadcast.transactions) {
  if (t.transactionType === "CREATE") contracts[t.contractName] = t.contractAddress;
}
const REGISTRY = contracts["MockAgentIdRegistry"];
const GUESTBOOK = contracts["AgentIdGuestbook"];
if (!REGISTRY || !GUESTBOOK) throw new Error("contracts not deployed on local Anvil; run the deploy script first");
console.log("registry:", REGISTRY, "\nguestbook:", GUESTBOOK);

// ---- temp copy of the frontend with local addresses + local ethers ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guestbook-web-"));
fs.copyFileSync(path.join(ROOT, "docs/index.html"), path.join(tmp, "index.html"));
fs.copyFileSync(path.join(ROOT, "docs/app.js"), path.join(tmp, "app.js"));
const ethersUmd = await (await fetch("https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js")).text();
fs.writeFileSync(path.join(tmp, "ethers.umd.min.js"), ethersUmd);
fs.writeFileSync(
  path.join(tmp, "config.js"),
  `window.APP_CONFIG = { chainId: 97, chainName: "BNB Smart Chain Testnet", rpcUrl: "${ANVIL_URL}", explorer: "https://testnet.bscscan.com", guestbookAddress: "${GUESTBOOK}", registryAddress: "${REGISTRY}", agentIdMainnet: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f" };\n`
);
let html = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
html = html.replace(
  'src="https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js"',
  'src="ethers.umd.min.js"'
);
fs.writeFileSync(path.join(tmp, "index.html"), html);

// ---- mock EIP-1193 provider backed by a real ethers Wallet on Anvil ----
function makeEthereum(wallet, provider) {
  let chainId = 31337;
  const listeners = {};
  return {
    _wallet: wallet,
    _setAccount(w) { this._wallet = w; },
    on(evt, fn) { (listeners[evt] ||= []).push(fn); },
    removeListener(evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); },
    emit(evt, ...args) { (listeners[evt] || []).forEach((f) => f(...args)); },
    async request({ method, params = [] }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [this._wallet.address];
        case "eth_chainId":
          return "0x" + chainId.toString(16);
        case "net_version":
          return String(chainId);
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain": {
          chainId = parseInt(params[0].chainId, 16);
          // NOTE: a real wallet also emits "chainChanged" here and the app
          // reloads the page; the shim skips the emit because jsdom cannot
          // navigate (window.location.reload is not implemented).
          return null;
        }
        case "eth_sendTransaction": {
          const tx = { ...params[0] };
          delete tx.from;
          const sent = await this._wallet.sendTransaction(tx);
          return sent.hash;
        }
        case "personal_sign":
        case "eth_sign":
          throw new Error(method + " not supported by test shim");
        default:
          return provider.send(method, params);
      }
    },
  };
}

const provider = new ethers.JsonRpcProvider(ANVIL_URL);
const holderWallet = new ethers.Wallet(HOLDER_KEY, provider);
const strangerWallet = new ethers.Wallet(STRANGER_KEY, provider);
const ethereum = makeEthereum(holderWallet, provider);

const dom = await JSDOM.fromFile(path.join(tmp, "index.html"), {
  url: "file://" + path.join(tmp, "index.html"),
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.ethereum = ethereum;
    // jsdom has no fetch, and its AbortSignal is a different class from
    // Node's: ethers (running in the jsdom realm) creates an AbortSignal
    // that Node's fetch rejects. Give the page Node's fetch + Abort
    // classes so instanceof checks pass.
    window.fetch = fetch;
    window.AbortController = AbortController;
    window.AbortSignal = AbortSignal;
  },
});
const { document } = dom.window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (id) => document.getElementById(id).textContent;

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  PASS:", name); }
  else { fail++; console.log("  FAIL:", name, extra); }
}

// wait for the page's initial loadMessages()
await sleep(4000);
const countNow = () => {
  const m = text("msgCount").match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : null;
};
console.log("\n== 1. initial read ==");
check("messages list shows the on-chain message posted earlier", text("messages").includes("Halo dari Agent ID Guestbook"));
check("message count badge shows a number >= 1", (countNow() || 0) >= 1);

// ---- connect as holder ----
console.log("\n== 2. connect as Agent ID holder ==");
document.getElementById("connectBtn").click();
await sleep(3000);
check("wallet connected", text("walletStatus").includes(holderWallet.address));
check("Agent ID holder recognised", text("agentIdStatus").includes("holds an Agent ID"));
check("post button enabled", !document.getElementById("postBtn").disabled);

// ---- post via the real UI ----
console.log("\n== 3. post via the UI ==");
const before = countNow();
document.getElementById("msgInput").value = "Pesan kedua dari UI frontend.";
document.getElementById("postBtn").click();
await sleep(8000);
check("tx confirmed message shown", text("txStatus").includes("Posted!"));
check("message count increased by 1", countNow() === before + 1, `(before=${before}, now=${countNow()})`);
check("new message rendered (newest first)", text("messages").indexOf("Pesan kedua dari UI frontend.") < text("messages").indexOf("Halo dari Agent ID Guestbook"));

// ---- switch to a non-holder wallet ----
console.log("\n== 4. switch to non-holder ==");
ethereum._setAccount(strangerWallet);
ethereum.emit("accountsChanged", [strangerWallet.address]);
await sleep(2500);
check("non-holder is told they hold no Agent ID", text("agentIdStatus").includes("holds no Agent ID"));
check("post button disabled for non-holder", document.getElementById("postBtn").disabled);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
dom.window.close();
process.exit(fail ? 1 : 0);
