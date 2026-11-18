// Configuration for the Agent ID Guestbook frontend.
// TESTNET deployment addresses are filled in after the contracts are
// deployed to BSC Testnet (chain 97). While an address is the zero
// address, the page shows a "deployment pending" banner and posting stays
// disabled. The mainnet Agent ID registry address is fixed and documented
// here for reference only — this demo runs on testnet.
window.APP_CONFIG = {
  chainId: 97,
  chainName: "BNB Smart Chain Testnet",
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  explorer: "https://testnet.bscscan.com",
  guestbookAddress: "0x0000000000000000000000000000000000000000", // TODO: fill after testnet deploy
  registryAddress: "0x0000000000000000000000000000000000000000", // TODO: fill after testnet deploy (mock registry)
  agentIdMainnet: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
};
