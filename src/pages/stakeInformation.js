import { createEl } from "../utils/dom.js";
import { getSanctumLatest, getSolscanLatest } from "../api.js";

function shortAddr(addr) {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function normalizeTime(t) {
  // В БД время у тебя может быть ISO или текстом с сайта
  if (!t) return "--";
  return String(t);
}

function normalizeAmount(a, token = "BulkSOL") {
  if (a === null || a === undefined || a === "") return `— ${token}`;
  return `${a} ${token}`;
}

export function renderStakeInformation(target) {
  target.innerHTML = "";
  const wrapper = createEl("div", { className: "page-shell" });

  // начальные значения (пока грузим)
  const tabs = [
    { title: "Total staked", value: "—", description: "BulkSOL locked" },
    { title: "1 BulkSOL =", value: "—", description: "USD equivalent" },
    { title: "Total holders", value: "—", description: "Wallets holding BulkSOL" },
  ];

  const mockTransactions = Array.from({ length: 10 }, (_, idx) => ({
    id: `tx-${idx + 1}`,
    time: "--",
    detail: "Loading…",
    amount: "— BulkSOL",
  }));

  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Stake</p>
        <h1>Stake Information</h1>
        <p class="muted">Holdings, pools, and yields will appear here</p>
      </div>
    </div>

    <section class="stake-tabs">
      ${tabs
        .map(
          (tab) => `
            <article class="stake-tab" data-bind-metric="${tab.title}">
              <p class="stake-tab__label">${tab.title}</p>
              <p class="stake-tab__value" data-bind-value="${tab.title}">${tab.value}</p>
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
          <p class="muted">Fetched dynamically from the backend</p>
        </div>
        <button type="button" class="btn-secondary stake-transactions__refresh" aria-label="Refresh transactions">
          Refresh
        </button>
      </div>
      <ul class="stake-transactions__list" data-bind-transactions>
        ${mockTransactions
          .map(
            (tx) => `
              <li class="stake-transaction" data-transaction-id="${tx.id}">
                <span class="stake-transaction__time">${tx.time}</span>
                <span class="stake-transaction__detail">${tx.detail}</span>
                <span class="stake-transaction__amount">${tx.amount}</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </section>
  `;

  target.appendChild(wrapper);

  const refreshBtn = wrapper.querySelector(".stake-transactions__refresh");
  const txList = wrapper.querySelector("[data-bind-transactions]");

  function setMetric(title, value) {
    const el = wrapper.querySelector(`[data-bind-value="${CSS.escape(title)}"]`);
    if (el) el.textContent = value ?? "—";
  }

  function renderTransactions(items) {
    if (!txList) return;

    if (!items || !items.length) {
      txList.innerHTML = `
        <li class="stake-transaction">
          <span class="stake-transaction__time">--</span>
          <span class="stake-transaction__detail">No transactions</span>
          <span class="stake-transaction__amount">—</span>
        </li>
      `;
      return;
    }

    txList.innerHTML = items
      .slice(0, 10)
      .map((it) => {
        const sig = it.signature || it.trans_id || "";
        const time = normalizeTime(it.time);
        const action = it.action || "TRANSFER";
        const from = shortAddr(it.from_address || "");
        const to = shortAddr(it.to_address || "");
        const detail = `${action} ${from} → ${to}`.trim();
        const amount = normalizeAmount(it.amount, it.token || "BULK");

        return `
          <li class="stake-transaction" data-transaction-id="${sig}">
            <span class="stake-transaction__time">${time}</span>
            <span class="stake-transaction__detail">${detail}</span>
            <span class="stake-transaction__amount">${amount}</span>
          </li>
        `;
      })
      .join("");
  }

  async function loadAll() {
    // UI: блокируем кнопку на время загрузки
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing…";

    try {
      // 1) Sanctum
      const sanctum = await getSanctumLatest();
      if (sanctum?.error) {
        console.error("Sanctum API error:", sanctum);
      } else {
        setMetric("Total staked", sanctum.total_staked || "—");
        setMetric("1 BulkSOL =", sanctum.bulk_to_sol || "—");
        setMetric("Total holders", sanctum.total_holders || "—");
      }

      // 2) Solscan latest
      const solscan = await getSolscanLatest(10);
      if (solscan?.error) {
        console.error("Solscan API error:", solscan);
        renderTransactions([]);
      } else {
        renderTransactions(solscan.items || []);
      }
    } catch (e) {
      console.error("Stake refresh failed:", e);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }

  function handleRefresh() {
    loadAll();
  }

  refreshBtn.addEventListener("click", handleRefresh);

  // Автозагрузка при входе на страницу
  loadAll();

  return () => {
    refreshBtn.removeEventListener("click", handleRefresh);
  };
}
