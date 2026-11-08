(() => {
  const root = document.documentElement;
  const saved = localStorage.getItem('diagonale.lang');
  const initial = saved === 'it' || saved === 'en' ? saved : navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const setLang = (l) => {
    root.dataset.lang = l;
    root.lang = l;
    localStorage.setItem('diagonale.lang', l);
    document.querySelectorAll('[data-set-lang]').forEach((b) => b.classList.toggle('active', b.dataset.setLang === l));
  };
  setLang(initial);
  document.querySelectorAll('[data-set-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.setLang)));

  // Highlight the visitor's OS in the download section
  const ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent;
  const os = /mac/i.test(ua) && !/iphone|ipad/i.test(navigator.userAgent) ? 'mac' : /win/i.test(ua) ? 'windows' : /linux|x11/i.test(ua) && !/android/i.test(navigator.userAgent) ? 'linux' : null;
  const names = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };
  if (os) {
    document.querySelector(`.dl[data-os="${os}"]`)?.classList.add('mine');
    document.querySelectorAll('[data-os-name]').forEach((el) => (el.textContent = names[os]));
    const primary = document.querySelector(`.dl[data-os="${os}"] .btn.primary`);
    if (primary) document.getElementById('hero-download').href = primary.href;
  }
})();
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#/')) location.replace('app/' + location.hash);
});

// ---------- canonical URL (rewritten at build time to the deploy domain) ----------
const SITE = 'https://iltempe.github.io/diagonale/';
const isIt = () => document.documentElement.dataset.lang === 'it';

// ---------- share (plain links, no third-party scripts) ----------
(() => {
  const text = () =>
    isIt()
      ? 'Diagonale: lavagna tattica animata, gratis e open source per allenatori di calcio. La tattica, fase per fase.'
      : 'Diagonale: free, open-source animated tactics board for football coaches. Tactics, phase by phase.';
  const url = SITE + '?ref=share';
  const e = encodeURIComponent;
  const targets = {
    whatsapp: () => `https://wa.me/?text=${e(text() + ' ' + url)}`,
    telegram: () => `https://t.me/share/url?url=${e(url)}&text=${e(text())}`,
    facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
    x: () => `https://x.com/intent/post?text=${e(text())}&url=${e(url)}`,
    linkedin: () => `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`,
    reddit: () => `https://www.reddit.com/submit?url=${e(url)}&title=${e(text())}`,
    email: () => `mailto:?subject=${e('Diagonale')}&body=${e(text() + '\n\n' + url)}`,
  };
  const refresh = () => {
    document.querySelectorAll('[data-share]').forEach((el) => {
      const k = el.dataset.share;
      if (targets[k]) el.href = targets[k]();
    });
  };
  refresh();
  document.querySelectorAll('[data-set-lang]').forEach((b) => b.addEventListener('click', refresh));
  const native = document.querySelector('[data-share="native"]');
  if (native && navigator.share) {
    native.hidden = false;
    native.addEventListener('click', () => navigator.share({ title: 'Diagonale', text: text(), url }).catch(() => {}));
  }
  const copy = document.querySelector('[data-share="copy"]');
  copy?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(url);
    const old = copy.innerHTML;
    copy.textContent = isIt() ? 'Copiato ✓' : 'Copied ✓';
    setTimeout(() => (copy.innerHTML = old), 1600);
  });
})();

// ---------- club badge generator ----------
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('badge-code')) return;
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LOGO =
    '<svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true" style="flex:0 0 auto"><rect width="64" height="64" rx="14" fill="#0F3D2E"/><path d="M18 14h13c11 0 19 7.6 19 18s-8 18-19 18H18z" fill="none" stroke="#F4F1EA" stroke-width="6" stroke-linejoin="round"/><path d="M12 54L46 18" stroke="#F2C230" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="6 5"/><path d="M50 14l-2 12-10-10z" fill="#F2C230"/></svg>';
  const TXT = {
    it: { top: 'Usiamo', tag: 'La tattica, fase per fase', uses: 'usa Diagonale', alt: 'Usiamo Diagonale' },
    en: { top: 'We use', tag: 'Tactics, phase by phase', uses: 'uses Diagonale', alt: 'We use Diagonale' },
  };
  const build = () => {
    const club = $('badge-club').value.trim();
    const theme = $('badge-theme').value;
    const lang = $('badge-lang').value;
    const kind = $('badge-kind').value;
    const t = TXT[lang];
    const dark = theme === 'dark';
    const title = esc(club ? `${club} ${t.uses}` : t.alt);
    const href = `${SITE}?ref=badge`;
    if (kind === 'img') {
      return `<a href="${href}" target="_blank" rel="noopener" title="${title}"><img src="${SITE}badge/diagonale-${lang}-${theme}.svg" alt="${title}" width="220" height="56" style="border:0"></a>`;
    }
    const bg = dark ? '#0F3D2E' : '#F4F1EA';
    const border = dark ? '#1f5c47' : '#d8d2c4';
    const main = dark ? '#F4F1EA' : '#0F3D2E';
    const accent = dark ? '#F2C230' : '#9a7300';
    const sub = dark ? '#c9d6cf' : '#4a5a53';
    return (
      `<!-- Diagonale badge -->\n<a href="${href}" target="_blank" rel="noopener" title="${title}" aria-label="${title}" ` +
      `style="display:inline-flex;align-items:center;gap:10px;padding:8px 16px 8px 8px;background:${bg};border:1px solid ${border};border-radius:12px;font-family:Arial,Helvetica,sans-serif;text-decoration:none;line-height:1.15;box-sizing:border-box">` +
      LOGO +
      `<span style="display:inline-flex;flex-direction:column">` +
      `<span style="color:${accent};font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">${esc(t.top)}</span>` +
      `<span style="color:${main};font-size:18px;font-weight:800;letter-spacing:.04em">DIAGONALE</span>` +
      `<span style="color:${sub};font-size:10px">${esc(club || t.tag)}</span>` +
      `</span></a>`
    );
  };
  const update = () => {
    const code = build();
    $('badge-code').value = code;
    // preview loads the image from this site (works before/without the canonical domain)
    $('badge-preview').innerHTML = code.replace(`${SITE}badge/`, 'badge/');
    $('badge-preview').classList.toggle('on-light', $('badge-theme').value === 'light');
  };
  ['badge-club', 'badge-theme', 'badge-lang', 'badge-kind'].forEach((id) => $(id).addEventListener('input', update));
  $('badge-lang').value = isIt() ? 'it' : 'en';
  update();
  $('badge-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('badge-code').value);
    const b = $('badge-copy');
    const old = b.innerHTML;
    b.textContent = isIt() ? 'Codice copiato ✓' : 'Code copied ✓';
    setTimeout(() => (b.innerHTML = old), 1600);
  });
})();
