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
