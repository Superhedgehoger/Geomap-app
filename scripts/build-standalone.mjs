import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const variantArg = process.argv.find((value) => value.startsWith('--variant='));
const variant = variantArg?.split('=')[1] === 'lite' ? 'lite' : 'full';

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} failed`))
    );
  });
}

await run('npm', ['run', 'build:pages']);

const dist = resolve('dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
html = html.replace(
  /<body([^>]*)>/,
  `<body$1>\n<script>window.GEOMAP_VARIANT=${JSON.stringify(variant)};</script>`
);

const mimeTypes = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function inlineCssUrls(css, cssPath) {
  const urlPattern = /url\((['"]?)(?!data:|https?:|#)([^)'"?]+)(?:\?[^)'" ]*)?\1\)/g;
  const matches = [...css.matchAll(urlPattern)];
  let result = css;
  for (const match of matches) {
    const assetPath = resolve(cssPath, '..', match[2]);
    const bytes = await readFile(assetPath);
    const mime = mimeTypes[extname(assetPath)] ?? 'application/octet-stream';
    result = result.replace(match[0], `url(data:${mime};base64,${bytes.toString('base64')})`);
  }
  return result;
}

for (const match of [
  ...html.matchAll(/<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/g)
]) {
  const href = match[1].replace(/^\.?\//, '');
  const cssFile = resolve(dist, href);
  const css = await inlineCssUrls(await readFile(cssFile, 'utf8'), cssFile);
  // A function replacement is required: vendor sources contain `$&`, `$'` and
  // similar sequences that String.replace otherwise expands as replacement tokens.
  html = html.replace(match[0], () => `<style data-source="${href}">\n${css}\n</style>`);
}

for (const match of [...html.matchAll(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/g)]) {
  const src = match[2].replace(/^\.?\//, '');
  const script = await readFile(resolve(dist, src), 'utf8');
  const attributes = `${match[1]} ${match[3]}`;
  const type = /type=["']module["']/.test(attributes) ? ' type="module"' : '';
  const escaped = script.replaceAll('</script>', '<\\/script>');
  html = html.replace(
    match[0],
    () => `<script${type} data-source="${src}">\n${escaped}\n</script>`
  );
}

await mkdir(resolve('release'), { recursive: true });
const output = resolve('release', `geomap-${variant}.html`);
await writeFile(output, html, 'utf8');
console.log(`Standalone ${variant} build: ${output}`);
