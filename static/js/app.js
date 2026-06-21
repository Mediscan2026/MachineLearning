/* ── MediScan — frontend logic ──────────────────────────── */

const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const previewSec  = document.getElementById('preview-section');
const previewImg  = document.getElementById('preview-img');
const uploadSec   = document.getElementById('upload-section');
const changeBtn   = document.getElementById('change-btn');
const scanBtn     = document.getElementById('scan-btn');
const resultSec   = document.getElementById('result-section');
const resultBody  = document.getElementById('result-body');
const dbBadge     = document.getElementById('db-badge');

let currentFile = null;

/* ── DB status ping ─────────────────────────────────────── */
async function checkStatus() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    if (d.db_loaded) {
      dbBadge.textContent = `BD : ${d.db_count} médicaments`;
      dbBadge.className = 'badge badge--ok';
    } else {
      dbBadge.textContent = 'data.csv manquant';
      dbBadge.className = 'badge badge--error';
    }
  } catch {
    dbBadge.textContent = 'Serveur hors ligne';
    dbBadge.className = 'badge badge--error';
  }
}
checkStatus();

/* ── File selection ─────────────────────────────────────── */
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f);
});

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});

changeBtn.addEventListener('click', () => {
  resetAll();
});

function loadFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Veuillez sélectionner une image (JPG, PNG, WEBP…)');
    return;
  }
  currentFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;

  uploadSec.classList.add('hidden');
  previewSec.classList.remove('hidden');
  resultSec.classList.add('hidden');
  resultBody.innerHTML = '';
}

function resetAll() {
  currentFile = null;
  fileInput.value = '';
  previewImg.src = '';
  uploadSec.classList.remove('hidden');
  previewSec.classList.add('hidden');
  resultSec.classList.add('hidden');
  resultBody.innerHTML = '';
  setScanLoading(false);
}

/* ── Scan button ─────────────────────────────────────────── */
scanBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  setScanLoading(true);
  resultSec.classList.add('hidden');

  const formData = new FormData();
  formData.append('file', currentFile);

  try {
    const r = await fetch('/api/scan', { method: 'POST', body: formData });
    const data = await r.json();
    renderResult(data);
  } catch (err) {
    renderResult({ status: 'error', message: 'Erreur réseau — serveur injoignable.' });
  } finally {
    setScanLoading(false);
  }
});

function setScanLoading(on) {
  const txt = scanBtn.querySelector('.btn-text');
  const ldr = scanBtn.querySelector('.btn-loader');
  scanBtn.disabled = on;
  txt.textContent = on ? 'Analyse en cours…' : 'Analyser l\'image';
  ldr.classList.toggle('hidden', !on);
  txt.classList.toggle('hidden', false);
}

/* ── Render result ───────────────────────────────────────── */
function renderResult(data) {
  resultSec.classList.remove('hidden');

  if (data.status === 'error' || data.status === 'no_db') {
    resultBody.innerHTML = errorHTML(data.message);
    return;
  }

  if (data.status === 'not_found') {
    resultBody.innerHTML = notFoundHTML(data);
    return;
  }

  // found
  resultBody.innerHTML = foundHTML(data);
}

function foundHTML(d) {
  const conf = Math.round((d.confidence || 1) * 100);
  const approx = d.confidence < 1 ? ' (correspondance approx.)' : '';

  let dosagePart = '';
  if (d.dosage) {
    dosagePart = `
      <div class="dosage-pill">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M10 3v14M3 10h14" stroke-linecap="round"/>
        </svg>
        Dosage : <strong>${d.dosage}</strong>
      </div>`;
  }

  let extraPart = '';
  if (d.extra && Object.keys(d.extra).length > 0) {
    const rows = Object.entries(d.extra)
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('');
    extraPart = `<table class="extra-table">${rows}</table>`;
  }

  let rawPart = '';
  if (d.raw_text && d.raw_text.length > 0) {
    const tags = d.raw_text.map(t => `<span class="raw-tag">${escHtml(t)}</span>`).join('');
    rawPart = `
      <div class="raw-section">
        <div class="raw-title">TEXTE DÉTECTÉ PAR L'OCR</div>
        <div class="raw-tags">${tags}</div>
      </div>`;
  }

  return `
    <div class="result-found">
      <div class="result-header">
        <div class="result-icon">
          ${checkIcon()}
        </div>
        <div>
          <div class="result-title">${escHtml(d.nom)}</div>
          <div class="result-sub">Médicament identifié${approx}</div>
        </div>
      </div>
      ${dosagePart}
      <div class="conf-wrap">
        <div class="conf-label">Confiance — ${conf}%</div>
        <div class="conf-bar"><div class="conf-fill" style="width:${conf}%"></div></div>
      </div>
      ${extraPart}
      ${rawPart}
    </div>`;
}

function notFoundHTML(d) {
  let dosagePart = '';
  if (d.dosage) {
    dosagePart = `<div class="dosage-pill">Dosage détecté : <strong>${d.dosage}</strong></div>`;
  }

  let rawPart = '';
  if (d.raw_text && d.raw_text.length > 0) {
    const tags = d.raw_text.map(t => `<span class="raw-tag">${escHtml(t)}</span>`).join('');
    rawPart = `
      <div class="raw-section">
        <div class="raw-title">TEXTE DÉTECTÉ</div>
        <div class="raw-tags">${tags}</div>
      </div>`;
  }

  return `
    <div class="result-notfound">
      <div class="result-header">
        <div class="result-icon">${warnIcon()}</div>
        <div>
          <div class="result-title">Non trouvé</div>
          <div class="result-sub">Absent de la base de données</div>
        </div>
      </div>
      ${dosagePart}
      ${rawPart}
    </div>`;
}

function errorHTML(msg) {
  return `
    <div class="result-error">
      <div class="result-header">
        <div class="result-icon">${crossIcon()}</div>
        <div>
          <div class="result-title">Erreur</div>
          <div class="result-sub">${escHtml(msg)}</div>
        </div>
      </div>
    </div>`;
}

/* ── SVG icons ───────────────────────────────────────────── */
function checkIcon() {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.2">
    <path d="M4 10l5 5L16 6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
function warnIcon() {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.2">
    <path d="M10 7v4M10 13.5v.5" stroke-linecap="round"/>
    <path d="M9.13 3.5L2.5 15.5A1 1 0 003.37 17h13.26a1 1 0 00.87-1.5L10.87 3.5a1 1 0 00-1.74 0z"/>
  </svg>`;
}
function crossIcon() {
  return `<svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.2">
    <path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round"/>
  </svg>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
