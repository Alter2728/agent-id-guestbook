// Agent ID Guestbook — frontend logic (ethers v6, no build step).
// Flow: connect wallet -> switch to BSC Testnet -> check Agent ID balance
// on-chain -> post/read messages. Posting always goes through the user's
// own wallet confirmation; this page never signs anything by itself.
(function () {
  const cfg = window.APP_CONFIG;
  const ZERO = "0x0000000000000000000000000000000000000000";
  const deployed = cfg.guestbookAddress !== ZERO && cfg.registryAddress !== ZERO;

  const GUESTBOOK_ABI = [
    "function agentId() view returns (address)",
    "function MAX_MESSAGE_LENGTH() view returns (uint256)",
    "function messageCount() view returns (uint256)",
    "function getMessage(uint256) view returns (address author, string text, uint256 timestamp)",
    "function getMessages(uint256 start, uint256 count) view returns (tuple(address author, string text, uint256 timestamp)[])",
    "function postMessage(string text)",
    "event MessagePosted(address indexed author, uint256 indexed index, string text, uint256 timestamp)",
  ];
  const REGISTRY_ABI = ["function balanceOf(address) view returns (uint256)"];

  const $ = (id) => document.getElementById(id);
  const walletStatus = $("walletStatus");
  const agentIdStatus = $("agentIdStatus");
  const networkStatus = $("networkStatus");
  const txStatus = $("txStatus");
  const postBtn = $("postBtn");
  const msgInput = $("msgInput");
  const postHint = $("postHint");

  let provider = null; // BrowserProvider (user wallet)
  let signer = null;
  let account = null;
  let readProvider = null; // JsonRpcProvider (public RPC, reads only)

  function shortAddr(a) {
    return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
  }

  function setDeployedUI() {
    $("gbAddr").textContent = deployed ? cfg.guestbookAddress : "not deployed yet";
    $("regAddr").textContent = deployed ? cfg.registryAddress : "not deployed yet";
    if (!deployed) {
      $("deployBanner").hidden = false;
      agentIdStatus.innerHTML = '<span class="warn">Contract not deployed yet — posting is disabled.</span>';
    }
  }

  // Switch the wallet to BSC Testnet using the raw injected provider,
  // BEFORE creating the ethers BrowserProvider. Creating the provider
  // first and switching after makes ethers throw NETWORK_ERROR ("network
  // changed") on the next operation, because the provider caches the
  // network it first saw.
  async function ensureTestnet() {
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(current, 16) === cfg.chainId) {
      networkStatus.innerHTML = '<span class="ok">Network: ' + cfg.chainName + ' (chain ' + cfg.chainId + ').</span>';
      return true;
    }
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + cfg.chainId.toString(16) }],
      });
      networkStatus.innerHTML = '<span class="ok">Switched to ' + cfg.chainName + '.</span>';
      return true;
    } catch (e) {
      if (e && e.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + cfg.chainId.toString(16),
              chainName: cfg.chainName,
              nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
              rpcUrls: [cfg.rpcUrl],
              blockExplorerUrls: [cfg.explorer],
            }],
          });
          networkStatus.innerHTML = '<span class="ok">Added and switched to ' + cfg.chainName + '.</span>';
          return true;
        } catch (e2) {
          networkStatus.innerHTML = '<span class="err">Could not add BSC Testnet: ' + (e2 && e2.message ? e2.message : e2) + '</span>';
          return false;
        }
      }
      networkStatus.innerHTML = '<span class="err">Please switch your wallet to BSC Testnet (chain 97) to post.</span>';
      return false;
    }
  }

  async function checkAgentId() {
    if (!deployed) return;
    try {
      const reg = new ethers.Contract(cfg.registryAddress, REGISTRY_ABI, readProvider);
      const bal = await reg.balanceOf(account);
      if (bal > 0n) {
        agentIdStatus.innerHTML = '<span class="ok">✓ This wallet holds an Agent ID (' + bal.toString() + '). You can post.</span>';
        msgInput.disabled = false;
        postBtn.disabled = false;
        postHint.textContent = "Posting costs testnet gas (tBNB) — you confirm in your wallet.";
      } else {
        agentIdStatus.innerHTML = '<span class="warn">This wallet holds no Agent ID, so it cannot post. (On testnet, a mock Agent ID is used for the demo.)</span>';
        msgInput.disabled = true;
        postBtn.disabled = true;
      }
    } catch (e) {
      agentIdStatus.innerHTML = '<span class="err">Could not check Agent ID: ' + (e && e.message ? e.message : e) + '</span>';
    }
  }

  function renderMessages(messages) {
    const box = $("messages");
    box.textContent = "";
    if (!messages || messages.length === 0) {
      box.innerHTML = '<p class="fineprint">No messages yet. Be the first Agent ID holder to write one.</p>';
      return;
    }
    // Newest first. NOTE: ethers v6 freezes contract-call Result arrays,
    // and .slice() on a frozen Result subclass returns another frozen
    // Result, so .reverse() would throw once there are 2+ messages.
    // Array.from() makes a plain mutable Array first.
    const items = Array.from(messages).reverse();
    for (const m of items) {
      const div = document.createElement("div");
      div.className = "msg";
      const meta = document.createElement("div");
      meta.className = "meta";
      const d = new Date(Number(m.timestamp) * 1000);
      meta.textContent = shortAddr(m.author) + " · " + d.toLocaleString();
      const text = document.createElement("div");
      text.className = "text";
      text.textContent = m.text; // textContent, never innerHTML: no injection.
      div.appendChild(meta);
      div.appendChild(text);
      box.appendChild(div);
    }
  }

  async function loadMessages() {
    if (!deployed) {
      renderMessages([]);
      $("msgCount").textContent = "";
      return;
    }
    try {
      const gb = new ethers.Contract(cfg.guestbookAddress, GUESTBOOK_ABI, readProvider);
      const count = await gb.messageCount();
      $("msgCount").textContent = "(" + count.toString() + ")";
      if (count === 0n) {
        renderMessages([]);
        return;
      }
      const n = count > 50n ? 50 : Number(count);
      const start = Number(count) - n;
      const page = await gb.getMessages(start, n);
      renderMessages(page);
    } catch (e) {
      $("messages").innerHTML = '<p class="err">Could not load messages: ' + (e && e.message ? e.message : e) + '</p>';
    }
  }

  async function connect() {
    if (typeof window.ethereum === "undefined") {
      walletStatus.innerHTML = '<span class="err">No wallet detected. Install a wallet with an injected provider (e.g. Binance Wallet or MetaMask) and reload.</span>';
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      account = accounts[0];
      walletStatus.innerHTML = 'Connected: <code>' + account + '</code>';
      // Switch network FIRST, then create the ethers provider, so the
      // provider never sees a network change (see ensureTestnet).
      const ok = await ensureTestnet();
      if (!ok) return;
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      await checkAgentId();
    } catch (e) {
      walletStatus.innerHTML = '<span class="err">Could not connect wallet: ' + (e && e.message ? e.message : e) + '</span>';
    }
  }

  async function post() {
    const text = msgInput.value.trim();
    if (!text) {
      txStatus.innerHTML = '<span class="warn">Write something first.</span>';
      return;
    }
    if (text.length > 280) {
      txStatus.innerHTML = '<span class="warn">Message is too long (max 280 characters).</span>';
      return;
    }
    postBtn.disabled = true;
    txStatus.textContent = "Waiting for your confirmation in the wallet…";
    try {
      const gb = new ethers.Contract(cfg.guestbookAddress, GUESTBOOK_ABI, signer);
      const tx = await gb.postMessage(text);
      txStatus.innerHTML = 'Transaction sent: <a href="' + cfg.explorer + '/tx/' + tx.hash + '" target="_blank" rel="noopener">' + tx.hash.slice(0, 18) + '…</a> — waiting for confirmation…';
      await tx.wait();
      txStatus.innerHTML = '<span class="ok">✓ Posted! <a href="' + cfg.explorer + '/tx/' + tx.hash + '" target="_blank" rel="noopener">View on BscScan testnet</a></span>';
      msgInput.value = "";
      await loadMessages();
    } catch (e) {
      txStatus.innerHTML = '<span class="err">Posting failed: ' + (e && e.message ? e.message : e) + '</span>';
    } finally {
      postBtn.disabled = false;
    }
  }

  function init() {
    setDeployedUI();
    if (typeof ethers === "undefined") {
      $("messages").innerHTML = '<p class="err">Could not load the ethers library from the CDN. Check your connection and reload.</p>';
      return;
    }
    readProvider = new ethers.JsonRpcProvider(cfg.rpcUrl);
    $("connectBtn").addEventListener("click", connect);
    $("refreshBtn").addEventListener("click", loadMessages);
    postBtn.addEventListener("click", post);
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", function (accounts) {
        if (accounts.length === 0) {
          account = null;
          walletStatus.textContent = "Wallet disconnected.";
          agentIdStatus.textContent = "";
          msgInput.disabled = true;
          postBtn.disabled = true;
        } else {
          connect();
        }
      });
      window.ethereum.on("chainChanged", function () { window.location.reload(); });
    }
    loadMessages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
