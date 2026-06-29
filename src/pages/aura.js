import { createEl } from "../utils/dom.js";
import { getAuraStats, getAuraLeaderboard, getAuraWallet } from "../api.js";

const BULK_AURA_URL = "https://early.bulk.trade/deposit";

function shortAddr(a) {
  if (!a) return "-";
  const s = String(a);
  if (s.length <= 12) return s;
  return `${s.slice(0, 5)}...${s.slice(-5)}`;
}

function fmt(n, decimals = 0) {
  if (n == null) return "-";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUSD(n) {
  if (n == null) return "-";
  const v = Number(n);
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return "$" + (v / 1_000).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

function getSavedWallet() {
  if (window.BULK_USER?.wallet_address) return window.BULK_USER.wallet_address;
  return localStorage.getItem("bulk_wallet") || "";
}

export function renderAura(target) {
  target.innerHTML = "";

  const wrapper = createEl("div", { className: "page-shell" });
  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Pre-deposit</p>
        <h1>Aura</h1>
        <p class="muted">Weekly points for BULK Pre-deposit participants</p>
      </div>
      <a href="${BULK_AURA_URL}" target="_blank" rel="noopener noreferrer" class="btn-secondary aura-ext-link">
        Open Pre-deposit site
      </a>
    </div>

    <div class="aura-stats-grid" id="aura-stats-grid">
      <div class="aura-stat-card">
        <div class="aura-stat-label">Current Week</div>
        <div class="aura-stat-value" id="aura-week">-</div>
      </div>
      <div class="aura-stat-card">
        <div class="aura-stat-label">Total Wallets</div>
        <div class="aura-stat-value" id="aura-wallets">-</div>
      </div>
      <div class="aura-stat-card">
        <div class="aura-stat-label">Total Deposited</div>
        <div class="aura-stat-value" id="aura-deposited">-</div>
      </div>
      <div class="aura-stat-card">
        <div class="aura-stat-label">Total Aura</div>
        <div class="aura-stat-value" id="aura-total">-</div>
      </div>
      <div class="aura-stat-card aura-stat-card--gain">
        <div class="aura-stat-label">Weekly Gain</div>
        <div class="aura-stat-value" id="aura-gain">-</div>
        <div class="aura-stat-sub" id="aura-synced"></div>
      </div>
    </div>

    <div class="aura-leaderboard">
      <div class="aura-leaderboard__header">
        <h2 class="aura-leaderboard__title">Top 10 Wallets</h2>
        <div class="aura-sort-btns">
          <button class="aura-sort-btn is-active" data-sort="aura">By Aura</button>
          <button class="aura-sort-btn" data-sort="deposit">By Deposit</button>
        </div>
      </div>
      <div id="aura-table-wrap"></div>
    </div>

    <div class="aura-wallet-check">
      <h2 class="aura-leaderboard__title">Check Wallet</h2>
      <p class="muted">Enter a Solana wallet address to see its Aura stats</p>
      <div class="aura-wallet-form">
        <input
          type="text"
          id="aura-wallet-input"
          class="aura-wallet-input"
          placeholder="Wallet address..."
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn-primary aura-wallet-btn" id="aura-wallet-btn">Check</button>
      </div>
      <div id="aura-wallet-result"></div>
    </div>
  `;

  target.appendChild(wrapper);

  let currentSort = "aura";
  let disposed = false;

  const weekEl = wrapper.querySelector("#aura-week");
  const walletsEl = wrapper.querySelector("#aura-wallets");
  const depositedEl = wrapper.querySelector("#aura-deposited");
  const totalEl = wrapper.querySelector("#aura-total");
  const gainEl = wrapper.querySelector("#aura-gain");
  const syncedEl = wrapper.querySelector("#aura-synced");
  const tableWrap = wrapper.querySelector("#aura-table-wrap");
  const walletInput = wrapper.querySelector("#aura-wallet-input");
  const walletBtn = wrapper.querySelector("#aura-wallet-btn");
  const walletResult = wrapper.querySelector("#aura-wallet-result");

  async function loadStats() {
    try {
      const s = await getAuraStats();
      if (disposed) return;
      weekEl.textContent = s.week_index != null ? `Week ${s.week_index}` : "-";
      walletsEl.textContent = s.total_wallets != null ? fmt(s.total_wallets) : "-";
      depositedEl.textContent = s.total_current != null ? fmtUSD(s.total_current) : "-";
      totalEl.textContent = s.total_aura != null ? fmt(s.total_aura) : "Syncing...";
      if (s.weekly_gain != null) {
        gainEl.textContent = (s.weekly_gain >= 0 ? "+" : "") + fmt(s.weekly_gain);
        gainEl.className = "aura-stat-value " + (s.weekly_gain >= 0 ? "delta-positive" : "delta-negative");
      } else {
        gainEl.textContent = "No data yet";
      }
      if (s.last_synced) {
        const d = new Date(s.last_synced);
        syncedEl.textContent = "Updated " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    } catch {
      if (disposed) return;
      weekEl.textContent = "-";
    }
  }

  function renderTable(rows) {
    if (!rows || rows.length === 0) {
      tableWrap.innerHTML = `<p class="muted" style="padding:16px 0">No data. Sync is running in the background.</p>`;
      return;
    }

    const isAuraSort = currentSort === "aura";
    const rankKey = isAuraSort ? "aura_rank" : "rank";
    const rankLabel = isAuraSort ? "Aura Rank" : "Deposit Rank";

    const html = `
      <table class="aura-table">
        <thead>
          <tr>
            <th>${rankLabel}</th>
            <th>Wallet</th>
            <th>Deposit</th>
            <th>Aura</th>
            <th>Referrals</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="aura-table__row">
              <td class="aura-table__rank">#${r[rankKey] ?? (i + 1)}</td>
              <td class="aura-table__wallet mono" title="${r.wallet}">${shortAddr(r.wallet)}</td>
              <td>$${fmt(r.deposited_amount)}</td>
              <td class="aura-table__aura">${fmt(r.aura)}</td>
              <td>${r.referral_number ?? 0}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    tableWrap.innerHTML = html;
  }

  async function loadLeaderboard() {
    tableWrap.innerHTML = `<p class="muted" style="padding:16px 0">Loading...</p>`;
    try {
      const rows = await getAuraLeaderboard(currentSort, 10);
      if (disposed) return;
      renderTable(rows);
    } catch {
      if (disposed) return;
      tableWrap.innerHTML = `<p class="muted" style="padding:16px 0">Failed to load leaderboard.</p>`;
    }
  }

  function renderWalletResult(data) {
    const cats = data.categories || {};
    const weekEntries = Object.entries(cats)
      .filter(([k]) => /^week\d+$/.test(k))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

    walletResult.innerHTML = `
      <div class="aura-wallet-card">
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Wallet</span>
          <span class="mono" title="${data.wallet}">${shortAddr(data.wallet)}</span>
        </div>
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Deposit Rank</span>
          <span>#${data.rank ?? "-"}</span>
        </div>
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Aura Rank</span>
          <span>#${data.aura_rank ?? "-"}</span>
        </div>
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Total Aura</span>
          <span class="delta-positive">${fmt(data.aura)}</span>
        </div>
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Deposited</span>
          <span>$${fmt(data.deposited_amount)}</span>
        </div>
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Current</span>
          <span>$${fmt(data.current_amount)}</span>
        </div>
        <div class="aura-wallet-card__row">
          <span class="aura-stat-label">Referrals</span>
          <span>${data.referral_number ?? 0}</span>
        </div>
        ${weekEntries.length > 0 ? `
          <div class="aura-wallet-card__weeks">
            <div class="aura-stat-label" style="margin-bottom:8px">Aura by Week</div>
            ${weekEntries.map(([k, v]) => `
              <div class="aura-wallet-card__row">
                <span>${k.replace("week", "Week ")}</span>
                <span>${fmt(v)}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  async function handleWalletCheck() {
    const addr = walletInput.value.trim();
    if (!addr) return;

    walletResult.innerHTML = `<p class="muted" style="padding:12px 0">Searching...</p>`;
    walletBtn.disabled = true;

    try {
      const data = await getAuraWallet(addr);
      if (disposed) return;
      renderWalletResult(data);
      localStorage.setItem("bulk_wallet", addr);
    } catch (e) {
      if (disposed) return;
      const is404 = e.message?.includes("404") || e.message?.includes("not found");
      walletResult.innerHTML = `<p class="muted" style="padding:12px 0">${
        is404
          ? "Wallet not found. It may not be in the Pre-deposit program."
          : "Error: " + (e.message || "Unknown error")
      }</p>`;
    } finally {
      if (!disposed) walletBtn.disabled = false;
    }
  }

  function handleSortClick(e) {
    const btn = e.target.closest(".aura-sort-btn");
    if (!btn) return;
    const sort = btn.dataset.sort;
    if (sort === currentSort) return;
    currentSort = sort;
    wrapper.querySelectorAll(".aura-sort-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.sort === sort)
    );
    loadLeaderboard();
  }

  wrapper.querySelector(".aura-sort-btns").addEventListener("click", handleSortClick);
  walletBtn.addEventListener("click", handleWalletCheck);
  walletInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleWalletCheck();
  });

  const saved = getSavedWallet();
  if (saved) walletInput.value = saved;

  loadStats();
  loadLeaderboard();

  return () => {
    disposed = true;
  };
}
