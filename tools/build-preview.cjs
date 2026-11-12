const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = [
  ['index.html', 'page-home', 'トップ'],
  ['news.html', 'page-news', 'お知らせ'],
  ['medical.html', 'page-medical', '診療内容'],
  ['about.html', 'page-about', '当院について'],
  ['hours.html', 'page-hours', '診療時間・所在地'],
  ['faq.html', 'page-faq', 'よくある質問'],
];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = new Set();
const images = new Map();

function prepare(html) {
  html = html.replace(/<script\b[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, file) => {
    scripts.add(file);
    return '';
  });
  html = html.replace(/href="((?:index|news|medical|about|hours|faq)\.html)(#[^"]*)?"/g, (_, file, hash) => {
    const [, id] = pages.find((page) => page[0] === file);
    return `href="#${id}"${hash ? ` data-preview-target="${hash.slice(1)}"` : ''}`;
  });
  return html.replace(/(<img\b[^>]*\bsrc=")\.\/([^"]+)(")/g, (_, before, file, after) => {
    if (!images.has(file)) {
      const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      images.set(file, `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`);
    }
    return before + images.get(file) + after;
  });
}

let header;
const views = pages.map(([file, id, label], index) => {
  const source = prepare(read(file));
  if (index === 0) header = source.match(/<header\b[\s\S]*?<\/header>/)[0];
  const main = source.match(/<main\b[\s\S]*<\/main>/)[0];
  return `<section class="preview-page ${id}" id="${id}" aria-label="${label}">${main}</section>`;
});
const css = read('css/style.css').replace(/@import[^;]+;/g, (rule) => rule.includes('Shippori+Antique') ? rule : '') + '\n' + read('css/booking.css');
const inlineScripts = [...scripts].map((file) => `<script>\n${read(file)}\n</script>`).join('\n');
const navigation = `
<script>
(() => {
  const updateNavigation = () => {
    const current = location.hash.startsWith('#page-') ? location.hash : '#page-home';
    document.querySelectorAll('.global-nav a').forEach((link) => {
      if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };
  window.addEventListener('hashchange', updateNavigation);
  updateNavigation();
  document.querySelector('.back-to-top').addEventListener('click', (event) => {
    event.preventDefault();
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    window.scrollTo({top: 0, behavior});
  });
  document.querySelectorAll('[data-preview-target]').forEach((link) => {
    link.addEventListener('click', () => requestAnimationFrame(() => {
      document.getElementById(link.dataset.previewTarget)?.scrollIntoView();
    }));
  });
})();
</script>`;
const output = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=1440">
<title>佐藤医院｜全6ページ プレビュー</title><style>${css}
.preview-page{display:none;}.preview-page.page-home{display:block;}
.preview-pages:has(> .preview-page:target) > .preview-page{display:none;}
.preview-pages:has(> .preview-page:target) > .preview-page:target{display:block;}
</style></head><body>${header}<div class="preview-pages">${views.join('\n')}</div>
<a class="back-to-top" href="#top" aria-label="最上部に戻る" title="最上部に戻る"></a>
${inlineScripts}${navigation}</body></html>`;
fs.writeFileSync(path.join(root, 'OPEN_SatoClinic.html'), output);
console.log(`Preview rebuilt: ${pages.length} pages, ${images.size} embedded images, ${scripts.size} scripts.`);
