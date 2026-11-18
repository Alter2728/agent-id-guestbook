# NOTES — Agent ID Guestbook (Binance Agent ID Hackathon)

Status 2026-11-18 ~22:05 WITA: contract + tests + frontend built, E2E-tested
locally (10/10). GitHub repo + Pages live. **Testnet deploy BLOCKED on tBNB**
(see "Blocker" below). No mainnet deploy (needs real BNB + user approval).

## What it is

"Agent ID Guestbook": an on-chain guestbook on BNB Chain. Only addresses
holding an Agent ID (`.ai` name) can post a short message (max 280 bytes);
anyone can read. Built for the Binance Agent ID Hackathon — announcement:
https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf

- Submission period: 18 Nov 2026 08:00 UTC → 9 Dec 2026 08:00 UTC
  (16:00 WITA 18 Nov → 16:00 WITA 9 Dec).
- Total $60,000 USDC: Growth Award $29,000 (top 10 by on-chain metrics:
  interacting Agent ID addresses + tx volume/count), Innovation Award $29,000
  (judges, 100 pts: Agent ID depth 30%, practicality 25%, completion 25%,
  innovation 20%; needs ≥30 Agent ID addresses interacting in the period),
  Community Promotion $2,000 (20 winners × $100 for X posts).
- The user's Agent ID: **altertera (altertera.ai)**.

## How Agent ID is used

- The guestbook constructor takes the Agent ID registry address (immutable).
- `postMessage` requires `registry.balanceOf(msg.sender) > 0`. That is the
  ONLY use of Agent ID: an on-chain access gate for posting. No name
  lookups, no wallet lookups by name, no off-chain identity checks.
- Mainnet registry: `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`
  (SPACE ID Agent ID, ERC-721, non-transferable).
- The registry is NOT deployed on BSC Testnet (verified: `eth_getCode` at
  that address on chain 97 returns `0x`). The testnet deployment therefore
  uses `MockAgentIdRegistry` (test-only, `src/`): `balanceOf` + a public
  `mint` for testing. The mock must NEVER be used on mainnet; the mainnet
  deploy passes the real registry address instead.

## Contract

`src/AgentIdGuestbook.sol` — deliberately minimal:

- `postMessage(string)`: holder-only, non-empty, ≤280 bytes, emits
  `MessagePosted(author, index, text, timestamp)`.
- `messageCount()`, `getMessage(uint256)`,
  `getMessages(uint256 start, uint256 count)`: read-only.
- No owner, no admin functions, no payable functions, no upgradeability,
  no mint/pause/tax/withdraw. Nothing in the contract can move user funds.

## Verification status

- `forge build`: OK (solc 0.8.38). `forge test`: **8/8 PASS**
  (`test/AgentIdGuestbook.t.sol`).
- Local Anvil E2E (deploy script + cast + frontend test): all green.
  - Mock registry `0x5FbDB2315678afecb367f032d93F642f64180aa3`,
    guestbook `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` (chain 31337,
    local only). Deployer held 1 mock ID; holder post succeeded
    (tx `0x4dd94958f0e01c431162b826e476eca1b809bc07340778162f6ac5e2ea3575ba`,
    166,526 gas); non-holder post reverted
    ("AgentIdGuestbook: caller holds no Agent ID"); count stayed 1.
  - Frontend E2E (`e2e/run.mjs`, jsdom + mock EIP-1193 wallet): **10/10
    PASS** — initial read, connect, holder recognition, posting through
    the real UI (tx confirmed, count +1, newest first), non-holder
    rejection (post button disabled).
  - Two REAL bugs found by the E2E and fixed:
    1. ethers v6 `BrowserProvider` throws NETWORK_ERROR ("network
       changed") if the chain is switched after the provider is created.
       Fix: switch chain via raw `window.ethereum.request` BEFORE
       creating the provider (`docs/app.js`, `ensureTestnet`/`connect`).
    2. ethers v6 freezes contract-call Result arrays; `.slice().reverse()`
       on a frozen Result throws once there are 2+ messages. Fix:
       `Array.from(messages).reverse()` (`docs/app.js`, `renderMessages`).
- **Testnet deployment: NOT DONE YET** (blocked — see below).
- **BscScan source verification: NOT DONE YET** (needs a deployed
  contract first). Plan: try `forge verify-contract --verifier sourcify`
  (no API key needed); if BscScan testnet does not surface Sourcify
  verification, use the BscScan web form (needs a browser) or a free
  BscScan API key (free account, no payment).

## Frontend / repo

- Repo: https://github.com/alter2728/agent-id-guestbook (public, MIT).
- Pages: https://alter2728.github.io/agent-id-guestbook/ (source: `docs/`).
- `docs/config.js` still has ZERO addresses + a "deployment pending"
  banner: the page is live and readable, but posting stays disabled until
  the testnet addresses are filled in after deploy.
- Frontend: static HTML + ethers v6.13.4 via jsDelivr CDN, no build step.
  User text is rendered with `textContent` (no HTML injection). All
  transactions require the user's own wallet confirmation.

## Blocker — tBNB for the testnet deploy

The throwaway dev wallet (`.dev-wallet.json`, mode 600, NEVER committed)
is `0xe0d22fe3db4Bb3dca4477aab30AdDaB30c99678a`, balance **0 tBNB**.

Faucet attempts 2026-11-18 (all from this VM, no browser):

- Official faucet https://www.bnbchain.org/en/testnet-faucet (via
  testnet.bnbchain.org/faucet-smart): requires **hCaptcha** — cannot be
  claimed via curl. Needs a live browser task (or the user on their phone).
- QuickNode faucet: requires Twitter/Discord login — no account, not tried.
- Chainstack faucet: requires a Chainstack login — no account, not tried.
- PancakeSwap faucet, faucet.bnbchain.org, testnet-faucet.bnbchain.org:
  unreachable from this VM.

UNBLOCK (pick one):

1. Parent runs a live browser task: open
   https://www.bnbchain.org/en/testnet-faucet, paste the dev wallet
   address above, solve the captcha, claim (0.5 tBNB per claim is plenty).
2. The user claims tBNB on their phone and sends ~0.1 tBNB to the dev
   wallet address above.

Then deploy (from `~/workspace/binance-agent-id-hackathon/`):

```sh
export PATH="$HOME/.foundry/bin:$PATH"
PRIVATE_KEY=$(python3 -c "import json; print(json.load(open('.dev-wallet.json'))['data'][0]['private_key'])") \
  forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://data-seed-prebsc-1-s1.binance.org:8545 --broadcast
```

Then: copy the two deployed addresses into `docs/config.js`
(guestbookAddress + registryAddress), commit + push, verify the Pages
site lets a holder post, and verify the source on BscScan testnet.

## Mainnet gas estimate (for the user's top-up decision)

Measured on the local run (same bytecode; mainnet gas will be similar).
BNB price $588.70 (CoinGecko, 2026-11-18).

| Action | Gas | @1 gwei | @3 gwei | @5 gwei |
|---|---|---|---|---|
| Deploy AgentIdGuestbook | ~1,089,280 | 0.00109 BNB (~$0.64) | 0.00327 BNB (~$1.92) | 0.00545 BNB (~$3.21) |
| First postMessage | ~166,526 | 0.00017 BNB (~$0.10) | 0.00050 BNB (~$0.29) | 0.00083 BNB (~$0.49) |
| Later postMessage | ~100–140k | ~$0.06–0.08 | ~$0.18–0.25 | ~$0.29–0.41 |

The mock registry deploy (~274,793 gas) + mint (~46,050 gas) are
TESTNET-ONLY and are NOT needed on mainnet. Recommended top-up for a
mainnet deploy + a few posts with margin: **~0.01 BNB (~$5.89)**.
Mainnet deploy is a separate step: it needs the user's explicit approval
+ funded wallet, and the guestbook must be deployed with the REAL
registry address (`0x60b926...`), NOT the mock.

## Submission steps remaining (not done — submission comes later)

1. Deploy to BSC Testnet (blocked — see above) and fill `docs/config.js`.
2. Verify source on BscScan testnet.
3. Sanity-check the live Pages site in a real browser with a wallet
   (connect → holder check → post → read). The VM's Chromium cannot do
   this end-to-end (egress proxy); a live browser task can.
4. Get real Agent ID holders to interact (the hard part: Growth needs
   on-chain activity; Innovation needs ≥30 Agent ID addresses in the
   submission period). The build alone does not guarantee this.
5. Submit during the submission period (before 9 Dec 2026 16:00 WITA):
   project name, website (Pages URL), contract address(es), Agent ID
   usage description, reward receiving address. No registration needed
   per the announcement.
6. Track 2 (separate): X post for the Community Promotion Award ($100 ×
   20) with #BinanceWalletHackathon + #AgenticWallet, link submitted via
   the official campaign survey — draft after the project is live.

## Safety red lines — compliance checklist

- [x] No web QR-code login for Agentic Wallet (wallet connects only via
      the user's own injected provider).
- [x] No bypassing user transaction confirmation (every post is a wallet
      transaction the user confirms).
- [x] No unauthorized asset transfers (contract has no payable/admin
      functions; frontend never moves funds).
- [x] Contract open-source (MIT) with permissions documented (there are
      none — no owner/admin).
- [x] No "Binance"/"BNB" brand impersonation in the project name, token
      name, or domain ("Agent ID Guestbook" only; "BNB Chain" used only
      as the factual chain name).
- [x] No return promises anywhere ("no rewards, income or returns" is
      stated on the page and in the README).
- [x] No collection of seed phrases / private keys / API secrets
      (nothing of the kind is asked for or stored; the dev wallet is a
      throwaway testnet key in the workspace, mode 600).
- [x] Agent ID is not packaged as a tool to look up other people's
      wallets by name (only the poster's own `balanceOf` gate; the UI
      shows raw addresses, never resolves `.ai` names).
- [x] Trading is not involved, so no trading risk warning applies.

## Honest odds

Growth and Innovation both need 30+ REAL Agent ID addresses interacting
with the contract during the submission period. That is the hard part and
is outside the build itself. What this build delivers is a correct, live,
eligible product: a working contract + frontend that genuinely uses Agent
ID. The $100 X-post award is the most realistic prize; the $29k awards
are long shots without an audience.
