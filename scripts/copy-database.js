// Copies every row from one Postgres database to another with the same schema, e.g. when moving the live
// database to another region. The target's existing rows are replaced; the source is only read.
//
//   COPY_FROM=postgresql://...  COPY_TO=postgresql://...  node scripts/copy-database.js --yes
//
// Use direct (non-pooled) connection strings. Run it while nobody is using the site, so nothing is missed.
import { createDb, migrate } from '../server/db.js';

const { COPY_FROM, COPY_TO } = process.env;
if (!COPY_FROM || !COPY_TO || !process.argv.includes('--yes')) {
  console.log('Set COPY_FROM and COPY_TO (direct connection strings) and add --yes. The target is overwritten.');
  process.exit(1);
}
if (COPY_FROM === COPY_TO) {
  console.log('COPY_FROM and COPY_TO are the same database.');
  process.exit(1);
}

const from = await createDb({ url: COPY_FROM });
const to = await createDb({ url: COPY_TO });

// Both databases at the latest schema, so their tables and columns match.
for (const [name, db] of [['source', from], ['target', to]]) {
  const applied = await migrate(db);
  if (applied.length) console.log(`Updated the ${name} database: ${applied.join(', ')}`);
}

// Tables in an order where every table comes after the tables it points at.
const tables = (await from.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`))
  .map((r) => r.tablename)
  .filter((t) => t !== 'schema_migrations');
const links = await from.query(
  `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'`,
);
const ordered = [];
const visit = (t, path = new Set()) => {
  if (ordered.includes(t) || path.has(t)) return;
  path.add(t);
  for (const l of links) if (l.child === t && l.parent !== t) visit(l.parent, path);
  ordered.push(t);
};
tables.sort().forEach((t) => visit(t));

const columnsOf = async (table) =>
  from.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );

const counts = {};
await to.tx(async (t) => {
  for (const table of [...ordered].reverse()) await t.query(`DELETE FROM "${table}"`);
  for (const table of ordered) {
    const cols = await columnsOf(table);
    // Rows that point at another row of the same table go after the row they point at.
    const self = links.filter((l) => l.child === table && l.parent === table);
    const rows = await from.query(`SELECT * FROM "${table}"`);
    const pending = [...rows];
    const done = new Set();
    const idCol = cols.some((c) => c.column_name === 'id') ? 'id' : null;
    let guard = pending.length + 1;
    while (pending.length && guard--) {
      for (let i = 0; i < pending.length; i++) {
        const row = pending[i];
        const waiting =
          self.length &&
          idCol &&
          cols.some(
            (c) => c.column_name !== idCol && row[c.column_name] && rows.some((r) => r[idCol] === row[c.column_name]) && !done.has(row[c.column_name]),
          );
        if (waiting) continue;
        const values = cols.map((c) =>
          ['json', 'jsonb'].includes(c.data_type) && row[c.column_name] !== null ? JSON.stringify(row[c.column_name]) : row[c.column_name],
        );
        await t.query(
          `INSERT INTO "${table}" (${cols.map((c) => `"${c.column_name}"`).join(', ')})
           VALUES (${cols.map((_, n) => `$${n + 1}`).join(', ')})`,
          values,
        );
        if (idCol) done.add(row[idCol]);
        pending.splice(i--, 1);
      }
    }
    if (pending.length) throw new Error(`Could not order the rows of ${table}`);
    if (rows.length) counts[table] = rows.length;
  }
});

console.log('Copied:', JSON.stringify(counts));
await from.close();
await to.close();
