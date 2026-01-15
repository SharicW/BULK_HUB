import { createEl } from "../utils/dom.js";
import {
  getSanctumLatest,
  getSolscanLatest,
  refreshSanctum,
  refreshSolscan,
} from "../api.js";

function shortAddr(s, left = 6, right = 6) {
  if (!s) return "";
  if (s.length <= left + right + 3) return s;
  return `${s.slice(0, left)}...${s.slice(-right)}`;
}

function safeText(v, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function formatAmount(amount, token = "BULK") {
  if (amount === null || amount === undefined || amount === "") return "—";
  return `${amount} ${token || "BULK"}`;
}

export function renderStakeInformation(target) {
  target.innerHTML = "";
  const wrapper = createEl("div", { className: "page-shell" });

  const tabs = [
    { key: "total_staked", title: "Total staked", value: "—", description: "BulkSOL locked" },
    { key: "bulk_to_sol", title: "1 BulkSOL =", value: "—", description: "SOL equivalent" },
    { key: "total_holders", title: "Total holders", value: "—", description: "Wallets holding BulkSOL" },
  ];

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Stake</p>
        <h1>Stake Information</h1>
        <p class="muted">Live data from your backend (Postgres)</p>
      </div>
    </div>

    <section class="stake-tabs">
      ${tabs
        .map(
          (tab) => `
            <article class="stake-tab" data-metric-key="${tab.key}">
              <p class="stake-tab__label">${tab.title}</p>
              <p class="stake-tab__value" data-metric-value>—</p>
              <p class="stake-tab__description">${tab.description}</p>
            </article>
          `
        )
        .join("")}
    </section>

    <section class="stake-transactions">
      <div class="stake-transactions__header">
        <div>
          <p class="eyebrow">Activity</p>
          <h2>10 recent transactions</h2>
          <p class="muted">Loaded from your DB via API</p>
        </div>
        <button type="button" class="btn-secondary stake-transactions__refresh" aria-label="Refresh transactions">
          Refresh
        </button>
      </div>

      <div class="muted" style="margin: 8px 0;" data-bind-status></div>

      <ul class="stake-transactions__list" data-bind-transactions>
        ${Array.from({ length: 10 })
          .map(
            (_, idx) => `
              <li class="stake-transaction">
                <span class="stake-transaction__time">—</span>
                <span class="stake-transaction__detail">Loading...</span>
                <span class="stake-transaction__amount">—</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </section>
  `;

  target.appendChild(wrapper);

  const refreshBtn = wrapper.querySelector(".stake-transactions__refresh");
  const statusEl = wrapper.querySelector("[data-bind-status]");
  const listEl = wrapper.querySelector("[data-bind-transactions]");

  let destroyed = false;
  let loading = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function setMetric(key, value) {
    const card = wrapper.querySelector(`[data-metric-key="${key}"]`);
    if (!card) return;
    const v = card.querySelector("[data-metric-value]");
    if (v) v.textContent = safeText(value);
  }

  function renderTxList(rows) {
    if (!listEl) return;
    const items = (rows || []).slice(0, 10);

    if (items.length === 0) {
      listEl.innerHTML = `
        <li class="stake-transaction">
          <span class="stake-transaction__time">—</span>
          <span class="stake-transaction__detail">No transactions yet</span>
          <span class="stake-transaction__amount">—</span>
        </li>
      `;
      return;
    }

    listEl.innerHTML = items
      .map((tx) => {
        const time = safeText(tx.time);
        const action = safeText(tx.action, "TRANSFER");
        const fromA = shortAddr(tx.from_address);
        const toA = shortAddr(tx.to_address);
        const detail = `${action} • ${fromA} → ${toA} • ${shortAddr(tx.signature, 10, 6)}`;
        const amount = formatAmount(tx.amount, tx.token);

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

  async function loadData() {
    if (loading) return;
    loading = true;
    setStatus("Loading...");

    try {
      const [sanctum, solscan] = await Promise.all([
        getSanctumLatest(),
        getSolscanLatest(10),
      ]);

      if (destroyed) return;

      // Sanctum metrics
      setMetric("total_staked", sanctum?.total_staked);
      setMetric("bulk_to_sol", sanctum?.bulk_to_sol);
      setMetric("total_holders", sanctum?.total_holders);

      // Solscan tx list
      renderTxList(solscan);

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Failed to load data from API. Check API service (502/CORS).");
    } finally {
      loading = false;
    }
  }

  async function handleRefresh() {
    if (loading) return;

    // Это “жёсткое” обновление: заставляем бекенд заново спарсить (может занять время).
    // Если хочешь только перечитать из БД — просто вызывай loadData() без refresh*().
    setStatus("Refreshing from network...");
    refreshBtn.disabled = true;

    try {
      await Promise.all([
        refreshSanctum(),
        refreshSolscan(10),
      ]);
    } catch (e) {
      console.warn("Refresh failed:", e);
    } finally {
      refreshBtn.disabled = false;
      await loadData();
    }
  }

  refreshBtn.addEventListener("click", handleRefresh);

  // авто-загрузка при открытии страницы
  loadData();

  return () => {
    destroyed = true;
    refreshBtn.removeEventListener("click", handleRefresh);
  };
}
