// Extract the complete official Simulink Blocks category manifest.
// Usage: node extract_simulink_block_manifest.js [output.json]
// Requires the playwright npm package and an installed Chromium browser.
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const output = process.argv[2] || `${__dirname}/simulink-block-manifest.json`;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ userAgent: 'python-requests/2.34.2' });
  await page.goto(
    'https://www.mathworks.com/help/releases/R2025b/simulink/referencelist.html?type=block&category=block-libraries',
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await page.waitForSelector('main table tbody tr', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const entries = await page.locator('main h2').evaluateAll((headings) => {
    const rows = [];
    for (const heading of headings) {
      const table = heading.parentElement.querySelector('table');
      if (!table) continue;
      for (const row of table.querySelectorAll('tr')) {
        const links = [...row.querySelectorAll('td.term a[href]')].filter(
          (link) => !link.getAttribute('href').includes('#'),
        );
        if (!links.length) continue;
        const link = links[links.length - 1];
        rows.push({
          category: heading.textContent.trim(),
          name: link.textContent.trim(),
          path: link.getAttribute('href').split('#')[0],
          summary: (row.querySelector('td.description')?.textContent || '').trim().replace(/\s+/g, ' '),
        });
      }
    }
    return rows;
  });
  await browser.close();
  const uniquePaths = new Set(entries.map((entry) => entry.path));
  if (entries.length !== 341 || uniquePaths.size !== 333) {
    throw new Error(`Official manifest changed: ${entries.length} entries / ${uniquePaths.size} paths; review before updating`);
  }
  fs.writeFileSync(output, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`Wrote ${entries.length} entries / ${uniquePaths.size} document paths to ${output}`);
})();
