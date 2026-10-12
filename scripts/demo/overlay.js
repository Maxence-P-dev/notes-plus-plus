// Injected into the page while recording the demo video: fake cursor,
// captions, title cards, highlights and a PDF preview. Not part of the app.
(() => {
  if (window.demo) return;
  const css = `
  #demo-cursor{position:fixed;left:0;top:0;z-index:100000;pointer-events:none;width:26px;height:26px;transform:translate(-4px,-3px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
  .demo-ripple{position:fixed;z-index:99999;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(109,93,252,.35);border:2px solid rgba(109,93,252,.8);animation:demoRip .5s ease-out forwards}
  @keyframes demoRip{from{transform:scale(.2);opacity:1}to{transform:scale(1.2);opacity:0}}
  #demo-caption{position:fixed;left:50%;bottom:46px;z-index:99998;transform:translate(-50%,10px);max-width:1040px;width:max-content;padding:11px 24px;border-radius:14px;background:rgba(14,12,26,.86);color:#fff;font:500 21px/1.42 "Segoe UI Variable Text","Segoe UI",sans-serif;text-align:center;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.25)}
  #demo-caption.show{opacity:1;transform:translate(-50%,0)}
  #demo-card{position:fixed;inset:0;z-index:99990;display:grid;place-items:center;color:#fff;font-family:"Segoe UI Variable Display","Segoe UI",sans-serif;background:radial-gradient(1200px 700px at 20% 10%,#8b7dff 0%,transparent 60%),radial-gradient(900px 600px at 90% 100%,#3a22c9 0%,transparent 60%),linear-gradient(135deg,#5b46f5,#2a1c8f);opacity:0;transition:opacity .6s ease;pointer-events:none}
  #demo-card.show{opacity:1}
  #demo-card .in{text-align:center;animation:demoUp .8s cubic-bezier(.2,.8,.2,1)}
  @keyframes demoUp{from{opacity:0;transform:translateY(24px)}}
  @keyframes demoIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  #demo-card h1{font-size:92px;font-weight:800;letter-spacing:-.03em;margin:18px 0 6px}
  #demo-card h2{font-size:54px;font-weight:800;letter-spacing:-.02em;margin:0 0 36px}
  #demo-card p{font-size:28px;opacity:.9;margin:0}
  #demo-card .chips{display:flex;gap:12px;justify-content:center;margin-top:34px}
  #demo-card .chip{padding:9px 18px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);font-size:19px;font-weight:600;opacity:0;animation:demoIn .6s cubic-bezier(.2,.8,.2,1) forwards}
  #demo-card .steps{display:flex;gap:22px}
  #demo-card .step{width:300px;padding:26px;border-radius:20px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);text-align:left;opacity:0;animation:demoIn .7s cubic-bezier(.2,.8,.2,1) forwards}
  #demo-card .num{width:44px;height:44px;border-radius:50%;background:#fff;color:#5b46f5;display:grid;place-items:center;font-size:22px;font-weight:800;margin-bottom:16px}
  #demo-card .step b{display:block;font-size:22px;margin-bottom:6px}
  #demo-card .step span{font-size:17px;opacity:.85;line-height:1.45;font-family:"Segoe UI",sans-serif}
  #demo-card .note{margin-top:28px;font-size:18px;opacity:0;padding:10px 18px;border-radius:12px;background:rgba(0,0,0,.18);display:inline-block;animation:demoIn .7s 1.6s forwards}
  #demo-card .url{margin-top:30px;display:inline-block;padding:14px 26px;border-radius:14px;background:#fff;color:#4a35e8;font-size:26px;font-weight:700}
  .demo-logo{width:130px;height:130px;border-radius:32px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  #demo-hl{position:fixed;z-index:99980;pointer-events:none;border:3px solid #6d5dfc;border-radius:14px;box-shadow:0 0 0 6px rgba(109,93,252,.22),0 0 40px rgba(109,93,252,.4);opacity:0;transition:all .45s cubic-bezier(.2,.8,.2,1)}
  #demo-hl.show{opacity:1}
  #demo-ghost{position:fixed;z-index:99995;pointer-events:none;padding:6px 12px;border-radius:8px;background:var(--menu);border:1px solid var(--border);box-shadow:var(--shadow);font:600 13.5px "Segoe UI",sans-serif;color:var(--text);transform:translate(14px,10px);opacity:.92}
  #demo-pdf{position:fixed;inset:0;z-index:99985;display:grid;place-items:center;background:rgba(10,10,20,.62);opacity:0;transition:opacity .4s;pointer-events:none}
  #demo-pdf.show{opacity:1}
  #demo-pdf .lbl{color:#fff;font:600 18px "Segoe UI",sans-serif;text-align:center;margin-bottom:14px;opacity:.9}
  #demo-pdf .sheet{width:420px;height:594px;background:#fff;border-radius:6px;box-shadow:0 30px 80px rgba(0,0,0,.5);padding:30px 32px;overflow:hidden;transform:translateY(20px) scale(.97);transition:transform .5s cubic-bezier(.2,.8,.2,1)}
  #demo-pdf.show .sheet{transform:none}
  #demo-pdf .t{font:700 23px "Segoe UI Variable Display","Segoe UI",sans-serif;color:#111;padding-bottom:9px;margin-bottom:12px;border-bottom:3px solid #6d5dfc}
  #demo-pdf .prose{--zoom:.52}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const LOGO = `<svg class="demo-logo" viewBox="0 0 64 64"><defs><linearGradient id="dl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a8cff"/><stop offset="1" stop-color="#5233f2"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#dl)"/><path d="M19 15h17.5a8.5 8.5 0 0 1 8.5 8.5V49H27.5a8.5 8.5 0 0 1-8.5-8.5z" fill="#fff"/><path d="M26.5 26h12M26.5 32.5h12M26.5 39h8" stroke="#6d5dfc" stroke-width="3.2" stroke-linecap="round"/></svg>`;

  const el = (id, tag = 'div') => {
    const e = document.createElement(tag);
    e.id = id;
    document.body.append(e);
    return e;
  };
  const cursor = el('demo-cursor');
  cursor.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5 19.5 13l-7 1.2 4 7.3-3 1.6-4-7.4L4 21z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const caption = el('demo-caption');
  const card = el('demo-card');
  const hl = el('demo-hl');
  const pdf = el('demo-pdf');
  let ghost = null;

  const place = (x, y) => {
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    if (ghost) {
      ghost.style.left = x + 'px';
      ghost.style.top = y + 'px';
    }
  };
  document.addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
  document.addEventListener('dragover', (e) => e.clientX && place(e.clientX, e.clientY), true);
  document.addEventListener(
    'mousedown',
    (e) => {
      const r = document.createElement('div');
      r.className = 'demo-ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.append(r);
      setTimeout(() => r.remove(), 600);
    },
    true
  );

  const pick = (sel, text) => {
    let els = [...document.querySelectorAll(sel)];
    if (text) els = els.filter((e) => e.textContent.trim().includes(text));
    return els.find((e) => e.getBoundingClientRect().width > 0) || null;
  };

  window.demo = {
    place,
    rect(sel, text, ax = 0.5, ay = 0.5) {
      const e = pick(sel, text);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width * ax, y: r.top + r.height * ay };
    },
    caption(text) {
      if (!text) return caption.classList.remove('show');
      caption.textContent = text;
      caption.classList.add('show');
    },
    card(kind) {
      if (!kind) return card.classList.remove('show');
      const delay = (i, base = 0.5, step = 0.35) => `style="animation-delay:${base + i * step}s"`;
      if (kind === 'intro') {
        card.innerHTML = `<div class="in">${LOGO}<h1>Notes++</h1><p>Ton cahier de cours, en mieux.</p>
          <div class="chips">${['Dossiers', 'Mise en forme', 'Encadrés', 'Thème sombre', 'Export PDF'].map((c, i) => `<span class="chip" ${delay(i, 0.9, 0.18)}>${c}</span>`).join('')}</div></div>`;
      } else if (kind === 'install') {
        const steps = [
          ['GitHub → Releases', 'Va sur la page du projet, section « Releases ».'],
          ['Télécharge', 'Le fichier NotesPlusPlus-Setup-1.0.0.exe.'],
          ['Installe', 'Lance le fichier et suis les étapes. C’est prêt !'],
        ];
        card.innerHTML = `<div class="in"><h2>Installation</h2><div class="steps">${steps
          .map(([b, s], i) => `<div class="step" ${delay(i, 0.4, 0.45)}><div class="num">${i + 1}</div><b>${b}</b><span>${s}</span></div>`)
          .join('')}</div><div class="note">⚠ Avertissement Windows ? « Informations complémentaires » → « Exécuter quand même »</div></div>`;
      } else if (kind === 'outro') {
        card.innerHTML = `<div class="in">${LOGO}<h1>Notes++</h1><p>Gratuit · Windows · Open source</p>
          <div class="url">github.com/Maxence-P-dev/notes-plus-plus</div><p style="margin-top:30px">Bon courage pour tes révisions ! ✨</p></div>`;
      }
      card.classList.add('show');
    },
    highlight(sel, text, pad = 6) {
      if (!sel) return hl.classList.remove('show');
      const e = pick(sel, text);
      if (!e) return;
      const r = e.getBoundingClientRect();
      Object.assign(hl.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      hl.classList.add('show');
    },
    // Selects `text` inside the editor; returns the centre of the selection.
    select(text) {
      const root = document.querySelector('.ProseMirror');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = n.data.indexOf(text);
        if (i >= 0) {
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + text.length);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          const r = range.getBoundingClientRect();
          return { x: r.right, y: r.top + r.height / 2, x0: r.left };
        }
      }
      return null;
    },
    ghost(label) {
      if (!label) {
        ghost?.remove();
        ghost = null;
        return;
      }
      ghost = el('demo-ghost');
      ghost.textContent = label;
      place(parseFloat(cursor.style.left) || 0, parseFloat(cursor.style.top) || 0);
    },
    drag(fromSel, fromText, toSel, toText, phase) {
      const from = pick(fromSel, fromText);
      const to = pick(toSel, toText);
      window.__dt = window.__dt || new DataTransfer();
      const ev = (t, target) => target.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: window.__dt }));
      if (phase === 'start') ev('dragstart', from);
      if (phase === 'over') ev('dragover', to);
      if (phase === 'drop') {
        ev('drop', to);
        ev('dragend', from || document.body);
        window.__dt = null;
      }
    },
    pdf(show) {
      if (!show) return pdf.classList.remove('show');
      const title = document.querySelector('#title').value;
      const body = document.querySelector('.ProseMirror').innerHTML;
      pdf.innerHTML = `<div><div class="lbl">Aperçu du PDF exporté</div><div class="sheet" data-theme="light"><div class="t"></div><div class="prose"></div></div></div>`;
      pdf.querySelector('.t').textContent = title;
      pdf.querySelector('.prose').innerHTML = body;
      requestAnimationFrame(() => pdf.classList.add('show'));
    },
  };
})();
