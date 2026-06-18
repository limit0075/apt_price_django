// static/js/components/StepIndicator.js

export function StepIndicator(containerId, prefix, labels) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labels.map((label, i) => {
    const n   = i + 1;
    const sep = i < labels.length - 1 ? '<span class="step-sep">›</span>' : '';
    return `<div class="step" id="step-${prefix}${n}"><div class="step-num">${n}</div>${label}</div>${sep}`;
  }).join('');

  let bar = document.getElementById(`step-progress-wrap-${prefix}`);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = `step-progress-wrap-${prefix}`;
    bar.className = 'step-progress-wrap';
    bar.innerHTML = `
      <div class="step-progress-bar">
        <div class="step-progress-fill" id="step-progress-fill-${prefix}" style="width:0%"></div>
      </div>
      <span class="step-progress-pct" id="step-progress-pct-${prefix}">0%</span>`;
    el.insertAdjacentElement('afterend', bar);
  }
}

export function setStep(prefix, active, total = 4) {
  for (let i = 1; i <= total; i++) {
    const el = document.getElementById(`step-${prefix}${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < active)        el.classList.add('done');
    else if (i === active) el.classList.add('active');
  }
  _updateProgress(prefix, Math.round((active - 1) / total * 100));
}

export function completeStep(prefix) {
  _updateProgress(prefix, 100);
}

function _updateProgress(prefix, pct) {
  const fill  = document.getElementById(`step-progress-fill-${prefix}`);
  const label = document.getElementById(`step-progress-pct-${prefix}`);
  if (fill)  fill.style.width   = `${pct}%`;
  if (label) label.textContent  = `${pct}%`;
}
