// static/js/components/StepIndicator.js

export function StepIndicator(containerId, prefix, labels) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labels.map((label, i) => {
    const n   = i + 1;
    const sep = i < labels.length - 1 ? '<span class="step-sep">›</span>' : '';
    return `<div class="step" id="step-${prefix}${n}"><div class="step-num">${n}</div>${label}</div>${sep}`;
  }).join('');
}

export function setStep(prefix, active, total = 4) {
  for (let i = 1; i <= total; i++) {
    const el = document.getElementById(`step-${prefix}${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < active)      el.classList.add('done');
    else if (i === active) el.classList.add('active');
  }
}
