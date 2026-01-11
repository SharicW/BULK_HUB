import { createEl } from '../utils/dom.js';

export function renderMemberContribution(target) {
  target.innerHTML = '';
  const wrapper = createEl('div', { className: 'page-shell' });
  wrapper.innerHTML = `
    <div class="page-header">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h1>Member Contributions</h1>
        <p class="muted">All contributions from the Bulk community in X will be displayed here</p>
      </div>
    </div>
    <section class="contributions__posts">
      <div class="contributions__posts-headline">
        <p class="eyebrow">Community stream</p>
        <h2>X Posts</h2>
      </div>
      </div>
      <div class="contributions__posts-search">
        <div class="form-group">
          <label for="x-posts-search">Search X username</label>
          <input type="text" id="x-posts-search" placeholder="e.g. @bulkbuilder" />
        </div>
        <button type="button" id="x-posts-search-btn" class="btn-primary">Show posts</button>
      </div>
      <div class="contributions__posts-result" id="x-posts-result">
        <span class="muted">Search results will show all posts by the selected username</span>
      </div>
    </section>
  `;
  target.appendChild(wrapper);

  const searchBtn = wrapper.querySelector('#x-posts-search-btn');
  const searchInput = wrapper.querySelector('#x-posts-search');
  const resultEl = wrapper.querySelector('#x-posts-result');

  function handlePostsSearch() {
    const username = searchInput.value.trim();
    resultEl.textContent = username
      ? `Showing posts for ${username} (placeholder).`
      : 'Enter a username to view their contributions.';
  }

  searchBtn.addEventListener('click', handlePostsSearch);

  return () => {
    searchBtn.removeEventListener('click', handlePostsSearch);
  };
}

