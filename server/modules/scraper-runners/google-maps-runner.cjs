const fs = require('fs');
const path = require('path');

function safeParseEnv(name) {
  try {
    return JSON.parse(process.env[name] || 'null');
  } catch (e) {
    return null;
  }
}

const payload = safeParseEnv('SCRAPER_PAYLOAD') || {};
const outputFile = process.env.SCRAPER_OUTPUT_FILE || path.join(process.cwd(), 'db', 'scraper-output', `gm-sample-${Date.now()}.csv`);

function makeSampleRows(q, max) {
  const rows = [];
  const count = Math.max(1, Math.min(50, max || 5));
  for (let i = 0; i < count; i++) {
    const name = `${q || 'Business'} ${i + 1}`;
    rows.push({
      business_name: name,
      phone: `+1-555-000-${String(1000 + i)}`,
      email: `info+${i}@example.com`,
      website: `https://www.example.com/${i}`,
      address: `${i + 1} Example St`,
      city: payload.city || 'Miami',
      state: payload.state || 'FL',
      zip: '33101',
      source: 'google_maps',
    });
  }
  return rows;
}

try {
  const q = payload.query || payload.term || 'Sample Business';
  const max = payload.maxLeads || payload.max_results || 5;
  const rows = makeSampleRows(q, max);

  const header = Object.keys(rows[0]).join(',') + '\n';
  const csv = header + rows.map(r => Object.values(r).map(v => String(v).replace(/"/g, '""')).map(v => '"' + v + '"').join(',')).join('\n') + '\n';

  // ensure dir exists
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, csv, 'utf8');

  console.log(`google-maps-runner: wrote ${rows.length} rows to ${outputFile}`);
  // exit success
  process.exit(0);
} catch (err) {
  console.error('google-maps-runner error:', err && err.stack ? err.stack : err);
  process.exit(1);
}
