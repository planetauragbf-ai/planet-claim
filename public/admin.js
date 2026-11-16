/* Page d'administration : membres, import, sauvegarde. Réservée au rôle admin (vérifié aussi par la base). */
(async function () {
  if (!window.PCRT) return;
  const { sb } = PCRT;
  const S = await PCRT.ready;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const log = t => { $('#log').textContent += t + '\n'; };
  $('#who').textContent = 'Connecté : ' + S.email + ' (' + S.role + ')';
  if (S.role !== 'admin') { document.querySelectorAll('section').forEach(s => s.remove()); $('main').insertAdjacentHTML('beforeend', '<section><p>Cette page est réservée aux administrateurs.</p></section>'); return; }

  /* ---------- accès : comptes Supabase + rôles ----------
     La création/suppression de comptes passe par l'Edge Function "admin-users"
     (seule détentrice de la clé service_role). Sans elle, on gère au moins les rôles. */
  let FN = true;
  async function fn(body) {
    const { data, error } = await sb.functions.invoke((window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.adminFunction) || 'admin-users', { body });
    if (error) {
      let m = error.message, st = error.context && error.context.status;
      try { const j = await error.context.json(); m = j.error || j.message || m; } catch (_) {}
      if (st === 404 || error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') { FN = false; m = 'fonction admin-users non installée ou mal réglée (voir GUIDE.md, étape 6 bis)'; }
      throw new Error(m);
    }
    return data;
  }
  const fdt = t => t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const ROLE_OPTS = r => ['staff', 'cf', 'admin'].map(x => `<option${x === r ? ' selected' : ''}>${x}</option>`).join('');

  async function members() {
    const { data: M, error } = await sb.from('members').select('*').order('email');
    if (error) return log('Lecture des membres impossible : ' + error.message);
    let U = null;
    try { U = {}; (await fn({ action: 'list' })).users.forEach(u => (U[u.email] = u)); $('#fnwarn').hidden = true; }
    catch (x) { U = null; $('#fnwarn').hidden = false; $('#fnwarn').innerHTML = '<span class="warn">Création automatique des comptes indisponible : ' + esc(x.message) + '.</span> En attendant, créez le compte dans Supabase (Authentication → Users → Add user) puis ajoutez l’accès ici.'; }
    $('#mem').innerHTML = M.map(m => {
      const u = U && U[m.email], me = m.email === S.email;
      const last = !U ? '' : u ? fdt(u.last) : '<span class="warn">pas de compte</span>';
      const acts = me ? '<span class="m">vous</span>' : [
        U && !u ? `<button class="s" data-mk="${esc(m.email)}">Créer le compte</button>` : '',
        U && u ? `<button class="s" data-rs="${esc(m.email)}">Nouveau mot de passe</button>` : '',
        `<button class="d" data-rm="${esc(m.email)}">Supprimer</button>`].join('');
      return `<tr><td>${esc(m.email)}</td><td>${esc(m.name)}</td><td>${me ? esc(m.role) : `<select data-role="${esc(m.email)}">${ROLE_OPTS(m.role)}</select>`}</td><td>${last}</td><td><div class="acts">${acts}</div></td></tr>`;
    }).join('');
    if (U) { const orphan = Object.keys(U).filter(e => !M.some(m => m.email === e)); if (orphan.length) $('#mem').insertAdjacentHTML('beforeend', orphan.map(e => `<tr><td>${esc(e)}</td><td colspan="2" class="m">compte sans accès à l’application</td><td>${fdt(U[e].last)}</td><td><div class="acts"><button class="d" data-rm="${esc(e)}">Supprimer le compte</button></div></td></tr>`).join('')); }
  }
  function showPw(email, pw, title) {
    const b = $('#pwbox'); b.hidden = false;
    const site = location.origin + '/';
    b.innerHTML = `<b>${esc(title)}</b><br>${esc(email)} · mot de passe provisoire : <code>${esc(pw)}</code>
      <div class="row" style="margin-top:10px"><button type="button" class="s" id="pw-cp">Copier le message à envoyer</button><button type="button" class="s" id="pw-x">Masquer</button></div>
      <p class="m" style="margin:8px 0 0">Il ne sera plus affiché ensuite. Envoyez l’adresse par e-mail et le mot de passe par un autre canal (SMS, téléphone). La personne le change au premier usage (bouton « Mot de passe » en bas à gauche).</p>`;
    $('#pw-cp').onclick = () => navigator.clipboard.writeText(`Bonjour,\n\nVotre accès à Planet’Claim (suivi des sinistres) est prêt.\nAdresse : ${site}\nIdentifiant : ${email}\nMot de passe provisoire : ${pw}\n\nMerci de le changer dès la première connexion (bouton « Mot de passe » en bas à gauche).`).then(() => ($('#pw-cp').textContent = 'Copié ✓'));
    $('#pw-x').onclick = () => { b.hidden = true; b.innerHTML = ''; };
  }
  members();

  $('#add').onsubmit = async e => {
    e.preventDefault();
    const email = $('#a-e').value.trim().toLowerCase(), name = $('#a-n').value.trim(), role = $('#a-r').value, password = $('#a-p').value.trim();
    const btn = $('#a-go'); btn.disabled = true;
    try {
      if (FN) {
        const r = await fn({ action: 'create', email, name, role, password: password || undefined });
        if (r.created) showPw(email, r.password, 'Accès créé');
        else { $('#pwbox').hidden = false; $('#pwbox').innerHTML = '<b>Accès donné.</b> Un compte existait déjà pour ' + esc(email) + ' : son mot de passe actuel est conservé (bouton « Nouveau mot de passe » si besoin).'; }
      } else {
        const { error } = await sb.from('members').upsert({ email, role, name, added: Date.now() });
        if (error) throw error;
      }
      $('#add').reset(); members();
    } catch (x) { alert('Création impossible : ' + x.message); }
    finally { btn.disabled = false; }
  };
  document.addEventListener('change', async e => {
    const email = e.target.dataset && e.target.dataset.role; if (!email) return;
    const { error } = await sb.from('members').update({ role: e.target.value }).eq('email', email);
    if (error) { alert('Modification impossible : ' + error.message); members(); }
  });
  document.addEventListener('click', async e => {
    const d = e.target.dataset || {};
    try {
      if (d.rm) {
        if (!confirm('Supprimer définitivement l’accès ET le compte de ' + d.rm + ' ?')) return;
        if (FN) await fn({ action: 'delete', email: d.rm });
        else { const { error } = await sb.from('members').delete().eq('email', d.rm); if (error) throw error; }
        members();
      } else if (d.rs) {
        if (!confirm('Générer un nouveau mot de passe provisoire pour ' + d.rs + ' ? L’ancien ne fonctionnera plus.')) return;
        const r = await fn({ action: 'reset', email: d.rs }); showPw(d.rs, r.password, 'Nouveau mot de passe');
      } else if (d.mk) {
        const m = (await sb.from('members').select('*').eq('email', d.mk).maybeSingle()).data || {};
        const r = await fn({ action: 'create', email: d.mk, name: m.name, role: m.role || 'staff' });
        if (r.password) showPw(d.mk, r.password, 'Compte créé'); members();
      }
    } catch (x) { alert(x.message); }
  });

  /* ---------- écriture par lots ---------- */
  const COLS = ['dossiers', 'mails', 'pots', 'docs', 'compta', 'balancier', 'logs', 'team', 'config', 'cf_share'];
  async function writeAll(items, overwrite) { // items: [{col,id,data}]
    let n = 0, skip = 0;
    for (let i = 0; i < items.length; i += 200) {
      const part = items.slice(i, i + 200);
      const rows = part.filter(x => x.col !== 'members').map(x => ({ col: x.col, id: String(x.id), data: x.data, ts: x.data && typeof x.data.ts === 'number' ? x.data.ts : null, updated_by: S.uid }));
      const mem = part.filter(x => x.col === 'members').map(x => ({ email: String(x.id).toLowerCase(), role: x.data.role, name: x.data.name || '', added: x.data.added || Date.now() }));
      if (rows.length) {
        const q = sb.from('docs').upsert(rows, { onConflict: 'col,id', ignoreDuplicates: !overwrite, count: 'exact' });
        const { error, count } = await q;
        if (error) throw error;
        const w = count == null ? rows.length : count; n += w; skip += rows.length - w;
      }
      if (mem.length) { const { error } = await sb.from('members').upsert(mem, { ignoreDuplicates: !overwrite }); if (error) throw error; n += mem.length; }
      log('… ' + Math.min(i + 200, items.length) + ' / ' + items.length);
    }
    return { n, skip };
  }

  /* ---------- import des dossiers embarqués dans l'HTML claude.ai ---------- */
  $('#b-html').onclick = async () => {
    const f = $('#f-html').files[0]; if (!f) return alert('Choisissez le fichier HTML.');
    const s = await f.text(), k = s.indexOf('const SEED=');
    if (k < 0) return log('Aucune donnée SEED trouvée dans ce fichier.');
    let seed;
    try { seed = parseJsonPrefix(s.slice(k + 11)); } catch (x) { return log('Lecture impossible : ' + x.message); }
    log(seed.length + ' dossiers trouvés.');
    try { const r = await writeAll(seed.filter(d => d && d.id).map(d => ({ col: 'dossiers', id: d.id, data: d })), false); log('Terminé : ' + r.n + ' ajoutés, ' + r.skip + ' déjà présents.'); }
    catch (x) { log('Erreur : ' + x.message); }
  };
  function parseJsonPrefix(t) { // lit un tableau JSON en tête de chaîne
    let d = 0, q = false, e = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') q = false; continue; }
      if (c === '"') q = true; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') { d--; if (!d) return JSON.parse(t.slice(0, i + 1)); }
    }
    throw new Error('tableau incomplet');
  }

  /* ---------- restauration JSON ---------- */
  $('#b-json').onclick = async () => {
    const f = $('#f-json').files[0]; if (!f) return alert('Choisissez le fichier JSON.');
    let j; try { j = JSON.parse(await f.text()); } catch (x) { return log('JSON invalide.'); }
    const C = j.collections || {}, items = [];
    Object.keys(C).forEach(col => { if (!/^[a-z_]{1,40}$/.test(col) || col === 'profiles') return; Object.keys(C[col]).forEach(id => items.push({ col, id, data: C[col][id] })); });
    if (!items.length) return log('Aucun document dans ce fichier.');
    if (!confirm(items.length + ' documents à restaurer' + ($('#ow').checked ? ' (en écrasant l’existant)' : '') + '. Continuer ?')) return;
    try { const r = await writeAll(items, $('#ow').checked); log('Terminé : ' + r.n + ' écrits, ' + r.skip + ' ignorés (déjà présents).'); }
    catch (x) { log('Erreur : ' + x.message); }
  };

  /* ---------- pièces jointes migrées (nom de fichier = identifiant) ---------- */
  $('#b-att').onclick = async () => {
    const L = [...$('#f-att').files]; if (!L.length) return alert('Choisissez les fichiers.');
    let n = 0, skip = 0, ko = 0;
    for (const f of L) {
      const id = f.name.replace(/\.[^.]*$/, '');
      if (!/^[a-z0-9]{8,64}$/i.test(id)) { log('Ignoré (nom non reconnu) : ' + f.name); ko++; continue; }
      const { error } = await sb.storage.from('assets').upload(id, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (!error) { n++; log('✓ ' + f.name); }
      else if (/exists|duplicate/i.test(error.message)) { skip++; log('déjà présent : ' + f.name); }
      else { ko++; log('Erreur ' + f.name + ' : ' + error.message); }
    }
    log('Terminé : ' + n + ' fichier(s) importé(s), ' + skip + ' déjà présent(s), ' + ko + ' en erreur.');
  };

  /* ---------- export ---------- */
  $('#b-exp').onclick = async () => {
    const out = { app: 'planet-claim', version: 1, exported: new Date().toISOString(), collections: {} };
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('docs').select('col,id,data').order('col').order('id').range(from, from + 999);
      if (error) return alert('Export impossible : ' + error.message);
      data.forEach(r => ((out.collections[r.col] = out.collections[r.col] || {})[r.id] = r.data));
      if (data.length < 1000) break;
    }
    const { data: m } = await sb.from('members').select('*');
    out.collections.members = {}; (m || []).forEach(x => (out.collections.members[x.email] = { role: x.role, name: x.name, added: x.added }));
    COLS.forEach(c => (out.collections[c] = out.collections[c] || {}));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    a.download = 'sauvegarde-sinistres-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  };
})();
