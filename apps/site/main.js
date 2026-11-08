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
