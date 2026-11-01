import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { argumentsFor, loadRuntimeFixtures, printReport } from './load.mjs';

const options = argumentsFor(process.argv.slice(2), ['fixtures', 'browser']);
const payload = await loadRuntimeFixtures(options.fixtures ?? process.env.TREERING_FIXTURES);
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const engines = { chromium, firefox, webkit };
const selected = options.browser ? [options.browser] : Object.keys(engines);
if (selected.some(name => !engines[name])) throw new Error('--browser must be chromium, firefox, or webkit');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><title>Logan Logger runtime fixtures</title>');
      return;
    }
    const filename = resolve(root, `.${pathname}`);
    if (!filename.startsWith(`${root}${sep}`) || !['.mjs', '.js'].includes(extname(filename))) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(filename));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let failed = false;
try {
  for (const name of selected) {
    let browser;
    try {
      browser = await engines[name].launch({ headless: true });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      const results = await page.evaluate(async ({ cases, outputs }) => {
        const [library, engine] = await Promise.all([import('/dist/browser.mjs'), import('/tests/runtimes/.built/engine.mjs')]);
        if (typeof window === 'undefined' || typeof document === 'undefined' || typeof process !== 'undefined') throw new Error('Expected real browser without Node globals');
        return engine.runFixtures(library, 'browser', cases, outputs);
      }, { cases: payload.cases, outputs: payload.outputs });
      console.log(`[runtime] ${name} ${browser.version()}; public entry /dist/browser.mjs`);
      if (!printReport(name, payload, results) || errors.length) failed = true;
      for (const error of errors) console.error(`[${name}] pageerror: ${error}`);
    } catch (error) {
      failed = true;
      console.error(`[${name}] runtime failure: ${error instanceof Error ? error.stack : String(error)}`);
    } finally { await browser?.close(); }
  }
} finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
if (failed) process.exitCode = 1;
