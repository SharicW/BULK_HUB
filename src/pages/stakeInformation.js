import { createEl } from "../utils/dom.js";
import {
  getSanctumLatest,
  getSolscanLatest,
  refreshSanctum,
  refreshSolscan,
} from "../api.js";

function shortAddr(a) {
  if (!a) return "";
  if (a.length <= 10) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function safeText(v, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function solscanTimeToAgeSeconds(timeText) {
  if (!timeText) return Number.POSITIVE_INFINITY;

  const t = String(timeText).toLowerCase().trim();

  if (t.includes("just now")) return 0;

  const m = t.match(
    /(\d+)\s*(sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|month|months|year|years)\s*ago/
  );

  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];

    const mult =
      unit.startsWith("sec") ? 1 :
      unit.startsWith("min") ? 60 :
      unit.startsWith("hr") ? 3600 :
      unit.startsWith("day") ? 86400 :
      unit.startsWith("week") ? 604800 :
      unit.startsWith("month") ? 2592000 :
      31536000;

    return n * mult;
  }

  const parsed = Date.parse(timeText);
  if (!Number.isNaN(parsed)) {
    return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  }

  return Number.POSITIVE_INFINITY;
}

function sortTransactionsNewestFirst(txs) {
  return [...(txs || [])].sort((a, b) => {
    return solscanTimeToAgeSeconds(a.time) - solscanTimeToAgeSeconds(b.time);
  });
}

function formatAmount(amount, token) {
  if (amount === null || amount === undefined || amount === "")
    return `— ${token || ""}`.trim();
  return `${amount} ${token || ""}`.trim();
}

export function renderStakeInformation(target) {
  target.innerHTML = "";
  const wrapper = createEl("div", { className: "page-shell" });

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Stake</p>
        <h1>Stake Information</h1>
        <p class="muted">Live data from BULK_HUB_DATABASE</p>
      </div>
    </div>

    <section class="stake-tabs">
      <article class="stake-tab" data-metric="total_staked">
        <p class="stake-tab__label">Total staked</p>
        <p class="stake-tab__value" data-value>Loading…</p>
        <p class="stake-tab__description">BulkSOL locked</p>
      </article>

      <article class="stake-tab" data-metric="bulk_to_sol">
        <p class="stake-tab__label">1 BulkSOL =</p>
        <p class="stake-tab__value" data-value>Loading…</p>
        <p class="stake-tab__description">SOL equivalent</p>
      </article>

      <article class="stake-tab" data-metric="total_holders">
        <p class="stake-tab__label">Total holders</p>
        <p class="stake-tab__value" data-value>Loading…</p>
        <p class="stake-tab__description">Wallets holding BulkSOL</p>
      </article>
    </section>

    <section class="stake-transactions">
      <div class="stake-transactions__header">
        <div>
          <p class="eyebrow">Activity</p>
          <h2>10 recent transactions</h2>
          <p class="muted">From Solscan (stored in DB)</p>
        </div>
        <button type="button" class="btn-secondary stake-transactions__refresh" aria-label="Refresh transactions">
          Refresh
        </button>
      </div>

      <ul class="stake-transactions__list" data-bind-transactions>
        <li class="stake-transaction">
          <span class="stake-transaction__time">…</span>
          <span class="stake-transaction__detail">Loading transactions…</span>
          <span class="stake-transaction__amount">…</span>
        </li>
      </ul>

      <p class="muted" style="margin-top: 10px;" data-bind-error></p>
    </section>
  `;

  target.appendChild(wrapper);

  const metricEls = {
    total_staked: wrapper.querySelector(`[data-metric="total_staked"] [data-value]`),
    bulk_to_sol: wrapper.querySelector(`[data-metric="bulk_to_sol"] [data-value]`),
    total_holders: wrapper.querySelector(`[data-metric="total_holders"] [data-value]`),
  };

  const txList = wrapper.querySelector("[data-bind-transactions]");
  const errEl = wrapper.querySelector("[data-bind-error]");
  const refreshBtn = wrapper.querySelector(".stake-transactions__refresh");

  function setError(msg) {
    errEl.textContent = msg ? String(msg) : "";
  }

  function renderTransactions(txs) {
    if (!Array.isArray(txs) || txs.length === 0) {
      txList.innerHTML = `
        <li class="stake-transaction">
          <span class="stake-transaction__time">—</span>
          <span class="stake-transaction__detail">No transactions yet</span>
          <span class="stake-transaction__amount">—</span>
        </li>
      `;
      return;
    }

    txList.innerHTML = txs
      .map((tx) => {
        const time = safeText(tx.time);
        const action = safeText(tx.action, "TRANSFER");
        const fromA = shortAddr(tx.from_address);
        const toA = shortAddr(tx.to_address);
        const detail = `${action}${fromA || toA ? ` • ${fromA} → ${toA}` : ""}`;
        const amount = formatAmount(tx.amount, tx.token || "BULK");

        return `
          <li class="stake-transaction" data-transaction-id="${safeText(tx.signature, "")}">
            <span class="stake-transaction__time">${time}</span>
            <span class="stake-transaction__detail">${detail}</span>
            <span class="stake-transaction__amount">${amount}</span>
          </li>
        `;
      })
      .join("");
  }

  async function loadAll() {
    setError("");

    // 1) Sanctum metrics
    try {
      const s = await getSanctumLatest();
      metricEls.total_staked.textContent = safeText(s.total_staked);
      metricEls.bulk_to_sol.textContent = safeText(s.bulk_to_sol);
      metricEls.total_holders.textContent = safeText(s.total_holders);
    } catch (e) {
      metricEls.total_staked.textContent = "—";
      metricEls.bulk_to_sol.textContent = "—";
      metricEls.total_holders.textContent = "—";
      setError(`Sanctum error: ${e.message}`);
    }

    // 2) Solscan tx list
    try {
      const txsRaw = await getSolscanLatest(10);
      const list = Array.isArray(txsRaw) ? txsRaw : (txsRaw?.data || []);
      const txs = sortTransactionsNewestFirst(list);
      renderTransactions(txs);
    } catch (e) {
      renderTransactions([]);
      setError((errEl.textContent ? errEl.textContent + " | " : "") + `Solscan error: ${e.message}`);
    }
  }

  async function handleRefresh() {
    refreshBtn.disabled = true;
    const oldText = refreshBtn.textContent;
    refreshBtn.textContent = "Refreshing…";
    setError("");

    try {
      await Promise.all([
        refreshSanctum().catch(() => null),
        refreshSolscan(10).catch(() => null),
      ]);
    } finally {
      await loadAll();
      refreshBtn.textContent = oldText;
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", handleRefresh);

  loadAll();

  return () => {
    refreshBtn.removeEventListener("click", handleRefresh);
  };
}
