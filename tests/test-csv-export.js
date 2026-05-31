// test-csv-export.js — Biomarker CSV export tests (wide matrix)
// Run: fetch('tests/test-csv-export.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  }
  const S = window._labState;

  // RFC-4180 line parser (mirrors js/dna.js parseCsvLine) — used to verify quoting.
  function parseCsvLine(line) {
    const values = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
      else current += ch;
    }
    values.push(current);
    return values;
  }

  // Run buildBiomarkersCSV against a controlled getActiveData() shape (`data`)
  // and a controlled importedData (notes + entries), restoring real state after.
  function build(data, importedData) {
    const saved = S.importedData;
    S.importedData = importedData || {};
    try { return window.buildBiomarkersCSV(data); }
    finally { S.importedData = saved; }
  }

  console.log('%c Biomarker CSV Export Tests ', 'background:#16a34a;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold');

  // ═══════════════════════════════════════════════════════════════════════
  // FULL EXPORT — one fully specified profile → one exact CSV.
  // Two collection dates; three markers across two categories; one note; one
  // null value (gap); one marker with no optimal range. Source files come from
  // markerSources. The whole output is asserted verbatim so the format is
  // readable at a glance and any drift fails loudly.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('%c Full export ', 'font-weight:bold;color:#f59e0b');

  const fullData = {
    dates: ['2024-04-15', '2025-03-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry',
        markers: {
          glucose:        { name: 'Glucose',         unit: 'mmol/l', refMin: 4.11, refMax: 5.6, optimalMin: 4, optimalMax: 5, values: [4.6, 4.8] },
          bilirubinTotal: { name: 'Bilirubin Total', unit: 'µmol/l', refMin: 3,    refMax: 24,  optimalMin: 8, optimalMax: 17, values: [12.5, null] },
        },
      },
      lipids: {
        label: 'Lipids',
        markers: {
          ldl: { name: 'LDL', unit: 'mmol/l', refMin: null, refMax: null, optimalMin: null, optimalMax: null, values: [null, 2.9] },
        },
      },
    },
  };
  const fullImported = {
    markerNotes: { 'biochemistry.glucose': 'fasting' },
    entries: [
      { date: '2024-04-15', markerSources: { 'biochemistry.glucose': { file: '2024-Q2 panel.pdf' }, 'biochemistry.bilirubinTotal': { file: '2024-Q2 panel.pdf' } } },
      { date: '2025-03-15', markerSources: { 'biochemistry.glucose': { file: 'annual.pdf' }, 'lipids.ldl': { file: 'annual.pdf' } } },
    ],
  };
  // Paste-ready CSV — copy the literal below straight into a spreadsheet to see
  // the exact shape. (Written with \n for readability; the builder emits \r\n,
  // so the assertion compares line-endings-normalized.)
  const EXPECTED = `Source file,,,,,,,,2024-Q2 panel.pdf,annual.pdf
Category,Marker,Unit,Reference Min,Reference Max,Optimal Min,Optimal Max,Note,2024-04-15,2025-03-15
Biochemistry,Glucose,mmol/l,4.11,5.6,4,5,fasting,4.6,4.8
Biochemistry,Bilirubin Total,µmol/l,3,24,8,17,,12.5,
Lipids,LDL,mmol/l,,,,,,,2.9`;

  const fullCsv = build(fullData, fullImported);
  const normalize = s => s.replace(/\r\n/g, '\n');
  assert('Full export: 2 dates × 3 markers with note, gap, missing range, and per-date source files renders the exact expected CSV',
    normalize(fullCsv) === EXPECTED);
  if (normalize(fullCsv) !== EXPECTED) {
    console.log('%c--- expected ---', 'color:#16a34a'); console.log(EXPECTED);
    console.log('%c--- actual ---', 'color:#dc2626'); console.log(normalize(fullCsv));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SPECIAL CASES — each builds a minimal mock and checks one behaviour.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('%c Special cases ', 'font-weight:bold;color:#f59e0b');

  // Calculated markers (and the whole calculatedRatios category) are excluded.
  {
    const data = {
      dates: ['2025-01-01'],
      categories: {
        calculatedRatios: { label: 'Calculated', calculated: true, markers: { tgHdl: { name: 'TG/HDL', unit: '', values: [1.2] } } },
        biochemistry:     { label: 'Biochemistry', markers: { phenoAge: { name: 'PhenoAge', unit: 'yr', calculated: true, values: [40] }, glucose: { name: 'Glucose', unit: 'mmol/l', values: [4.8] } } },
      },
    };
    const csv = build(data, { entries: [] });
    assert('Excludes calculated category + calculated markers',
      csv.includes('Glucose') && !csv.includes('TG/HDL') && !csv.includes('PhenoAge'));
  }

  // Markers with no values across all dates are dropped entirely.
  {
    const data = {
      dates: ['2025-01-01'],
      categories: { biochemistry: { label: 'Biochemistry', markers: {
        glucose:   { name: 'Glucose', unit: 'mmol/l', values: [4.8] },
        neverDone: { name: 'Never Measured', unit: 'x', values: [null] },
      } } },
    };
    const csv = build(data, { entries: [] });
    assert('Skips markers with no values', csv.includes('Glucose') && !csv.includes('Never Measured'));
  }

  // Range bounds are separate numeric cells (never "4-5", which Excel coerces to
  // a date) and blank when absent.
  {
    const data = {
      dates: ['2025-01-01'],
      categories: { biochemistry: { label: 'Biochemistry', markers: {
        glucose: { name: 'Glucose', unit: 'mmol/l', refMin: 4.11, refMax: 5.6, optimalMin: 4, optimalMax: 5, values: [4.8] },
      } } },
    };
    const row = parseCsvLine(build(data, { entries: [] }).split('\r\n')[2]);
    assert('Range bounds are separate numeric cells', row[3] === '4.11' && row[4] === '5.6' && row[5] === '4' && row[6] === '5');
  }

  // Missing range bounds render as blank cells (no shifting).
  {
    const data = {
      dates: ['2025-01-01'],
      categories: { lipids: { label: 'Lipids', markers: {
        ldl: { name: 'LDL', unit: 'mmol/l', refMin: null, refMax: null, optimalMin: null, optimalMax: null, values: [2.9] },
      } } },
    };
    const row = parseCsvLine(build(data, { entries: [] }).split('\r\n')[2]);
    assert('Absent ranges are blank, value still aligned', row[3] === '' && row[6] === '' && row[8] === '2.9');
  }

  // Notes containing commas/quotes are RFC-4180 quoted and parse back losslessly.
  {
    const data = { dates: ['2025-01-01'], categories: { biochemistry: { label: 'Biochemistry', markers: {
      glucose: { name: 'Glucose', unit: 'mmol/l', values: [4.8] },
    } } } };
    const note = 'fasting, "AM" draw';
    const csv = build(data, { markerNotes: { 'biochemistry.glucose': note }, entries: [] });
    const row = parseCsvLine(csv.split('\r\n')[2]);
    assert('Tricky note round-trips through quoting', row[7] === note);
    assert('Tricky note is quoted in raw text', csv.includes('"fasting, ""AM"" draw"'));
  }

  // Manual entries (markerSources file: null) leave the source cell blank.
  {
    const data = { dates: ['2025-01-01'], categories: { biochemistry: { label: 'Biochemistry', markers: {
      glucose: { name: 'Glucose', unit: 'mmol/l', values: [4.8] },
    } } } };
    const csv = build(data, { entries: [{ date: '2025-01-01', markerSources: { 'biochemistry.glucose': { file: null } } }] });
    const sourceRow = parseCsvLine(csv.split('\r\n')[0]);
    assert('Manual entry → blank source-file cell', sourceRow[8] === '');
  }

  // Multiple distinct files on one date are joined with "; ".
  {
    const data = { dates: ['2025-01-01'], categories: { biochemistry: { label: 'Biochemistry', markers: {
      glucose: { name: 'Glucose', unit: 'mmol/l', values: [4.8] },
      tsh:     { name: 'TSH', unit: 'mU/l', values: [1.5] },
    } } } };
    const csv = build(data, { entries: [{ date: '2025-01-01', markerSources: {
      'biochemistry.glucose': { file: 'panel-a.pdf' }, 'biochemistry.tsh': { file: 'panel-b.pdf' },
    } }] });
    assert('Multiple source files joined with "; "', parseCsvLine(csv.split('\r\n')[0])[8] === 'panel-a.pdf; panel-b.pdf');
  }

  // singlePoint markers (DEXA etc.) carry one value at cat.singleDate, which
  // getActiveData keeps off the main data.dates axis. The value must land in its
  // OWN date column, and that date must be added to the header.
  {
    const data = {
      dates: ['2024-01-15', '2025-03-15'],
      categories: {
        biochemistry: { label: 'Biochemistry', markers: {
          glucose: { name: 'Glucose', unit: 'mmol/l', values: [4.6, 4.8] },
        } },
        bodyComposition: { label: 'Body Composition', singlePoint: true, singleDate: '2025-03-15', markers: {
          bodyFatPct: { name: 'Body Fat', unit: '%', values: [18.2] },
        } },
      },
    };
    const csv = build(data, { entries: [] });
    const lines = csv.split('\r\n');
    const header = parseCsvLine(lines[1]);
    const fatRow = lines.slice(2).map(parseCsvLine).find(r => r[1] === 'Body Fat');
    const col = header.indexOf('2025-03-15');
    const otherCol = header.indexOf('2024-01-15');
    assert('singlePoint value lands in its singleDate column, not column 0',
      fatRow && fatRow[col] === '18.2' && fatRow[otherCol] === '',
      fatRow ? `2025=${fatRow[col]} 2024=${fatRow[otherCol]}` : 'row missing');
  }

  // A singlePoint marker whose singleDate is NOT among data.dates still gets a
  // dedicated date column (the axis is the union of both).
  {
    const data = {
      dates: ['2024-01-15'],
      categories: {
        boneDensity: { label: 'Bone Density', singlePoint: true, singleDate: '2025-06-01', markers: {
          tScoreSpine: { name: 'T-score Spine', unit: '', values: [-1.2] },
        } },
      },
    };
    const csv = build(data, { entries: [] });
    const header = parseCsvLine(csv.split('\r\n')[1]);
    const row = parseCsvLine(csv.split('\r\n')[2]);
    assert('singleDate outside data.dates gets its own column',
      header.includes('2025-06-01') && row[header.indexOf('2025-06-01')] === '-1.2',
      header.join(','));
  }

  // CSV formula injection: a user-controlled cell starting with = + @ or a
  // non-numeric - is tab-prefixed (and quoted) so spreadsheets treat it as text.
  // Genuine negative numbers are left numeric.
  {
    const data = { dates: ['2025-01-01'], categories: { biochemistry: { label: 'Biochemistry', markers: {
      evil: { name: '=HYPERLINK("http://x","clickme")', unit: '', values: [1] },
      tscore: { name: 'T-score', unit: '', values: [-1.2] },
    } } } };
    const csv = build(data, { entries: [] });
    const rows = csv.split('\r\n').slice(2).map(parseCsvLine);
    const evilRow = rows.find(r => r[1].includes('HYPERLINK'));
    const tsRow = rows.find(r => r[1] === 'T-score');
    assert('Formula-prefixed marker name is neutralized with a leading tab',
      evilRow && evilRow[1].charCodeAt(0) === 9, evilRow ? JSON.stringify(evilRow[1].slice(0,3)) : 'missing');
    assert('Genuine negative number is left numeric (no tab)',
      tsRow && tsRow[8] === '-1.2', tsRow ? JSON.stringify(tsRow[8]) : 'missing');
  }

  // No value-bearing markers → source-file row + header only (2 lines).
  {
    const data = { dates: [], categories: { biochemistry: { label: 'Biochemistry', markers: {} } } };
    const csv = build(data, { entries: [] });
    assert('Empty data → source row + header only', csv.split('\r\n').length === 2);
  }

  // ═══════════════════════════════════════
  console.log(`%c ${pass} passed, ${fail} failed `,
    `background:${fail ? '#dc2626' : '#16a34a'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);
  return { pass, fail };
})();
