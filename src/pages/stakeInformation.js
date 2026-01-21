// src/pages/stakeInformation.js
import { createEl } from "../utils/dom.js";
import {
  getSanctumLatest,
  getSolscanLatest,
  refreshSanctum,
  refreshSolscan,
} from "../api.js";

function shortAddr(a) {
  if (!a) return "";
  const s = String(a);
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function safeText(v, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function looksLikeRelativeTime(s) {
  if (!s) return false;
  const t = String(s).toLowerCase();
  return (
    t.includes("just now") ||
    /\bago\b/.test(t) ||
    /\b(sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|month|months|year|years)\b/.test(
      t
    )
  );
}

function looksLikeSignature(s) {
  if (!s) return false;
  const t = String(s).trim();
  // very rough: long base58-ish without spaces
  return t.length >= 25 && !t.includes(" ") && /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
}

/**
 * Нормализуем транзакцию, потому что иногда парсер кладёт:
 * time <- signature, action <- "5 mins ago", from <- "TRANSFER", to <- from_address
 * В таком случае:
 *  - time берем из action
 *  - action берем из from_address
 *  - from берем из to_address
 *  - to у нас может отсутствовать (оставляем пустым)
 */
function normalizeTx(tx) {
  const out = {
    signature: tx?.signature ?? "",
    time: tx?.time ?? "",
    action: tx?.action ?? "",
    from_address: tx?.from_address ?? "",
    to_address: tx?.to_address ?? "",
    amount: tx?.amount,
    token: tx?.token ?? "BULK",
    value: tx?.value,
  };

  // если time выглядит как сигнатура, а action как "xx mins ago" — это точно съезд
  if (looksLikeSignature(out.time) && looksLikeRelativeTime(out.action)) {
    return {
      ...out,
      time: out.action,                // было: "5 mins ago"
      action: out.from_address || "",  // было: "TRANSFER"
      from_address: out.to_address || "",
      to_address: "",                  // реальный to потерян при съезде — лучше пусто, чем враньё
    };
  }

  return out;
}

function timeToEpochMs(timeText) {
  if (!timeText) return 0;
  const raw = String(timeText).trim();
  const t = raw.toLowerCase();

  if (t.includes("just now")) return Date.now();

  // "53 mins ago", "1 hr ago", "2 hrs ago", etc.
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

    return Date.now() - n * mult * 1000;
  }

  // ISO / date string support
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;

  return 0;
}

function sortTransactionsNewestFirst(txs) {
  return [...(txs || [])].sort((a, b) => {
    const na = normalizeTx(a);
    const nb = normalizeTx(b);

    // чем больше epoch — тем новее, значит сортируем по убыванию
    const ta = timeToEpochMs(na.time);
    const tb = timeToEpochMs(nb.time);

    if (tb !== ta) return tb - ta;

    // стабильный тай-брейк
    return String(nb.signature || "").localeCompare(String(na.signature || ""));
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
    total_staked: wrapper.querySelector(
      `[data-metric="total_staked"] [data-value]`
    ),
    bulk_to_sol: wrapper.querySelector(
      `[data-metric="bulk_to_sol"] [data-value]`
    ),
    total_holders: wrapper.querySelector(
      `[data-metric="total_holders"] [data-value]`
    ),
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
      .map((raw) => {
        const tx = normalizeTx(raw);

        const time = safeText(tx.time);
        const action = safeText(tx.action, "TRANSFER");
        const fromA = shortAddr(tx.from_address);
        const toA = shortAddr(tx.to_address);

        const detail =
          fromA || toA
            ? `${action} • ${fromA || "—"} → ${toA || "—"}`
            : `${action}`;

        const amount = formatAmount(tx.amount, tx.token || "BULK");

        return `
          <li class="stake-transaction" data-transaction-id="${safeText(
            tx.signature,
            ""
          )}">
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
      const txs = sortTransactionsNewestFirst(Array.isArray(txsRaw) ? txsRaw : []);
      renderTransactions(txs);
    } catch (e) {
      renderTransactions([]);
      setError(
        (errEl.textContent ? errEl.textContent + " | " : "") +
          `Solscan error: ${e.message}`
      );
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
