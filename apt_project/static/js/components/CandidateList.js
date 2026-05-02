// static/js/components/CandidateList.js
import { esc } from '../utils/format.js';

/**
 * @param {string}   containerId
 * @param {object[]} items
 * @param {Function} renderItem  (item, i) => { main, sub? }
 * @param {Function} onSelect    (item, i, el) => void
 * @param {'default'|'grid'} variant
 */
export function CandidateList(containerId, items, renderItem, onSelect, variant = 'default') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const wrapClass = variant === 'grid' ? 'complex-grid' : 'cand-list';
  const itemClass = variant === 'grid' ? 'complex-item' : 'cand-item';

  container.innerHTML = `
    <div class="${wrapClass}">
      ${items.map((item, i) => {
        const { main, sub } = renderItem(item, i);
        return `
          <div class="${itemClass}" data-index="${i}">
            <div class="cand-main">${esc(main)}</div>
            ${sub ? `<div class="cand-sub">${esc(sub)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;

  container.querySelectorAll(`.${itemClass}`).forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll(`.${itemClass}`).forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      const idx = parseInt(el.dataset.index, 10);
      onSelect(items[idx], idx, el);
    });
  });
}
