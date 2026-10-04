// Bundles web/ into one self-contained HTML file (dist/wordpool.html) for easy sharing.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const read = (p) => readFileSync(join(root, p), 'utf8');
// Order matters: dependencies first. Strip import/export syntax into one module scope.
const order = ['js/geom.js', 'js/glyphs.js', 'js/engine.js', 'js/words.js', 'js/generator.js', 'js/levels.js', 'js/render.js', 'js/audio.js', 'js/themes.js', 'js/economy.js', 'js/game.js'];
let js = '';
for (const f of order) {
  const original = read(f);
  let src = original;
  src = src.replace(/^import[^;]*;\s*$/gm, '');
  src = src.replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  src = src.replace(/^export\s+(const|let|function|class|async function)\s/gm, '$1 ');
  js += `\n// ---- ${f} ----\n${src}`;
  if (f === 'js/economy.js') {
    // game.js refers to the economy module as a namespace (`E.`); recreate it in the single scope
    const names = [...original.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    js += `\nconst E = { ${names.join(', ')} };\n`;
  }
}
const levels = read('levels.json');
js += `\n// ---- inline levels ----\nshipped = new Map(JSON.parse(${JSON.stringify(levels)}).levels.map((l) => [l.level, l]));\n`;
js += `\nconst game = new Game(document.getElementById('app'));\nwindow.__wp = game;\n`;
let html = read('index.html');
// replacer functions: a replacement *string* would interpret `$$`, `$&` etc. inside the game code
html = html.replace(/<link rel="stylesheet" href="css\/style.css" \/>/, () => `<style>\n${read('css/style.css')}\n</style>`);
html = html.replace(/<link rel="manifest"[^>]*>\s*/, '').replace(/<link rel="icon"[^>]*>\s*/, '').replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '');
html = html.replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script type="module">\n${js}\n</script>`);
mkdirSync(join(root, '..', 'dist'), { recursive: true });
writeFileSync(join(root, '..', 'dist', 'wordpool.html'), html);
console.log('wrote dist/wordpool.html', (html.length / 1024).toFixed(0) + 'KB');

// Fragment variant for hosts that wrap the page in their own document skeleton (e.g. Claude Artifacts):
// <title> + <style> + body markup + inline module script, no doctype/html/head/body tags.
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
const fragment = `<title>Word Pool</title>\n${style}\n${body}`;
writeFileSync(join(root, '..', 'dist', 'artifact.html'), fragment);
console.log('wrote dist/artifact.html', (fragment.length / 1024).toFixed(0) + 'KB');
