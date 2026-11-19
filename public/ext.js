/* Planet'Claim — compléments d'ergonomie, chargés après l'application.
   Gardés à part pour survivre à une régénération de index.html (scripts/build.py).

   « Créer le ticket sinistre » : à l'origine, transformer une déclaration en
   sinistre passait uniquement par le bouton « Clôturer » de la liste, puis
   l'option « Créer un ticket ». On ajoute un accès direct :
     - dans la liste des déclarations, à côté de « Clôturer » ;
     - dans la fiche d'une déclaration (même close sans ticket).
   Le bouton appelle le circuit normal de l'application (potNewTicket) :
   formulaire prérempli, confirmation, puis la déclaration passe en « Ticket créé ». */
(function () {
  'use strict';
  const ok = () => { try { return MODE !== 'cf' && canA('create') && canA('potw'); } catch (_) { return false; } };
  const pot = id => { try { return (POT || []).find(x => x.id === id); } catch (_) { return null; } };

  function rowButtons() {
    if (!ok()) return;
    document.querySelectorAll('[data-pcl]').forEach(b => {
      if (b.hidden || b.parentElement.querySelector('[data-pnt]')) return;
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'keep p'; x.dataset.pnt = b.dataset.pcl;
      x.textContent = '→ Sinistre'; x.title = 'Créer le ticket sinistre prérempli depuis cette déclaration';
      x.style.marginLeft = '6px';
      b.after(x);
    });
  }
  function dialogButton() {
    const el = document.getElementById('pd');
    if (!el || !el.open || !ok()) return;
    const p = pot(el.dataset.id), save = el.querySelector('#pds');
    if (!p || !save || p.statut === 'Ticket créé' || el.querySelector('[data-pnt]')) return;
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'p'; x.dataset.pnt = p.id;
    x.textContent = 'Créer le ticket sinistre';
    x.title = 'Ouvre le formulaire de ticket prérempli avec cette déclaration';
    save.parentElement.insertBefore(x, save.parentElement.firstChild);
  }

  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { rowButtons(); dialogButton(); }, 30); })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'hidden'] });

  // Capture : passe avant le clic « ouvrir la fiche » de la ligne.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-pnt]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const p = pot(b.dataset.pnt);
    if (!p) return;
    const pd = document.getElementById('pd');
    if (pd && pd.open) {
      const dirty = [...pd.querySelectorAll('[data-p]')].some(i => !i.disabled && String(p[i.dataset.p] || '') !== i.value.trim() && !['constat', 'dateCmd', 'dateLiv', 'le'].includes(i.dataset.p));
      if (dirty && !confirm('Les modifications non enregistrées de cette fiche ne seront pas reprises dans le ticket. Continuer ?')) return;
      pd.close();
    }
    potNewTicket(p);
  }, true);
})();

/* ---------- Balancier : filtres ----------
   Le Balancier est entièrement calculé à partir des dossiers (D). On filtre D le
   temps du rendu : tous les onglets (par dossier, mois, annuel, global,
   statistiques, déclaration) et leurs exports suivent le filtre.
   Préfixes pcbalf / pcxflt / pcf- : l'application utilise déjà data-bf et data-pcf. */
(function () {
  'use strict';
  const KEY = 'pc.balFilters';
  const FIELDS = [
    ['carr', 'Transporteur'],
    ['adh', 'Adhérent'],
    ['pays', 'Pays de destination'],
    ['zone', 'Zone'],
    ['type', 'Type de sinistre'],
    ['statut', 'Statut'],
    ['ass', 'Assurance'],
  ];
  const EMPTY = '__vide__';
  let BF = {};
  try { BF = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { BF = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(BF)); } catch (_) {} };
  const txt = v => String(v == null ? '' : v).trim();
  const low = v => { try { return dnorm(v); } catch (_) { return txt(v).toLowerCase(); } };
  const val = (d, k) => { if (k === 'zone') { try { return txt(zoneOf(d)); } catch (_) {} } return txt(d[k]); };
  const active = () => FIELDS.some(([k]) => BF[k]) || !!txt(BF.q);
  function match(d) {
    for (const [k] of FIELDS) {
      const f = BF[k]; if (!f) continue;
      const v = val(d, k);
      if (f === EMPTY ? v !== '' : v !== f) return false;
    }
    const q = low(BF.q || '');
    if (q && !low([d.client, d.email, d.num, d.cmd, d.track, d.refCF, d.adh].join(' ')).includes(q)) return false;
    return true;
  }
  const h = s => { try { return esc(s); } catch (_) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } };

  function bar(all, n) {
    const sel = ([k, label]) => {
      const C = {};
      all.forEach(d => { const v = val(d, k); C[v] = (C[v] || 0) + 1; });
      const opts = Object.keys(C).filter(v => v !== '').sort((a, b) => a.localeCompare(b, 'fr'));
      const cur = BF[k] || '';
      if (cur && cur !== EMPTY && !opts.includes(cur)) opts.unshift(cur);
      return `<label>${label}<select data-pcxflt="${k}"${cur ? ' class="on"' : ''}><option value="">Tous</option>${opts.map(v => `<option value="${h(v)}"${v === cur ? ' selected' : ''}>${h(v)} (${C[v] || 0})</option>`).join('')}${C[''] ? `<option value="${EMPTY}"${cur === EMPTY ? ' selected' : ''}>Non renseigné (${C['']})</option>` : ''}</select></label>`;
    };
    let note = '';
    try { if (BALT === 'dec' && active()) note = '<p class="m" style="margin:6px 0 0">Les totaux de l’export mensuel Coste Fermon (tous envois) ne sont pas filtrés ; les lignes sinistres le sont.</p>'; } catch (_) {}
    return `<div id="pcbalf" class="pcbalf"><div class="pcbalf-g">${FIELDS.map(sel).join('')}<label class="pcbalf-q">Client (destinataire), commande, suivi<input type="search" id="pcf-q" value="${h(BF.q || '')}" placeholder="Nom, n° de commande, n° de suivi…"></label></div>
<div class="pcbalf-s"><span>${active() ? `<b>${n}</b> dossier${n > 1 ? 's' : ''} sur ${all.length} · filtre actif` : `${all.length} dossiers · aucun filtre`}</span>${active() ? '<button type="button" class="keep" id="pcf-x">Réinitialiser les filtres</button>' : ''}</div>${note}</div>`;
  }

  if (!document.getElementById('pcbalf-css')) {
    const st = document.createElement('style'); st.id = 'pcbalf-css';
    st.textContent = `.pcbalf{border:1px solid var(--ln);border-radius:8px;background:var(--sf);padding:12px 14px;margin:8px 0 14px}
.pcbalf-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 10px}
.pcbalf label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mut);margin:0}
.pcbalf select,.pcbalf input{width:100%;padding:6px 8px;border:1px solid var(--ln);border-radius:6px;background:var(--sf);color:var(--ink);font:inherit;font-size:13px}
.pcbalf select.on{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac)}
.pcbalf-q{grid-column:span 2}@media(max-width:520px){.pcbalf-q{grid-column:auto}}
.pcbalf-s{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:13px}`;
    document.head.appendChild(st);
  }

  if (typeof balHtml !== 'function') return;
  const orig = balHtml;
  balHtml = function () {
    const all = D;
    let html, n = all.length;
    try {
      if (active()) { D = all.filter(match); n = D.length; }
      html = orig.apply(this, arguments);
    } finally { D = all; }
    try { if (BALT === 'his') return html; } catch (_) {}
    const i = html.indexOf('<p class="hbar">');
    const j = i < 0 ? -1 : html.indexOf('</p>', i);
    return j < 0 ? bar(all, n) + html : html.slice(0, j + 4) + bar(all, n) + html.slice(j + 4);
  };

  const redraw = () => { try { if (view === 'bal') page(); } catch (_) {} };
  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.pcxflt; if (!k) return;
    if (e.target.value) BF[k] = e.target.value; else delete BF[k];
    save(); redraw();
  });
  let tq = null;
  document.addEventListener('input', e => {
    if (e.target.id !== 'pcf-q') return;
    const v = e.target.value; clearTimeout(tq);
    tq = setTimeout(() => {
      BF.q = v; save(); redraw();
      const q = document.getElementById('pcf-q');
      if (q) { q.focus(); try { q.setSelectionRange(v.length, v.length); } catch (_) {} }
    }, 350);
  });
  // Une déclaration (mensuelle ou annuelle) doit porter sur tous les dossiers : on bloque son
  // enregistrement tant qu'un filtre est actif, pour ne jamais stocker de chiffres partiels.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-bal="dsave"],[data-bal="asave"]');
    if (!b || !active()) return;
    e.preventDefault(); e.stopPropagation();
    alert('Des filtres sont actifs dans le Balancier : la déclaration ne serait calculée que sur une partie des dossiers.\n\nCliquez sur « Réinitialiser les filtres », vérifiez les montants, puis enregistrez.');
  }, true);
  document.addEventListener('click', e => {
    if (e.target.id !== 'pcf-x') return;
    BF = {}; save(); redraw();
  });
})();
