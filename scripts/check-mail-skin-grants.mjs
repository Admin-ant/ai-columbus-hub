#!/usr/bin/env node
/**
 * Integratietest: controleert dat de vereiste Supabase Data-API GRANTs
 * op de mail-skin tabellen aanwezig zijn.
 *
 * Vereist een werkende `psql` met PG* env vars (of PGURI).
 *
 * Draaien:
 *   bun run test:grants
 */
import { execFileSync } from "node:child_process";

const TABLES = ["mail_backgrounds", "mail_background_versions"];

// Verwachte privileges per rol. anon = geen toegang (auth-only).
const EXPECTED = {
  authenticated: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true },
  service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true },
  anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false },
};

function psql(sql) {
  const out = execFileSync("psql", ["-tAX", "-F", "|", "-c", sql], {
    encoding: "utf8",
  });
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((r) => r.split("|"));
}

const roles = Object.keys(EXPECTED);
const privs = ["SELECT", "INSERT", "UPDATE", "DELETE"];

const selects = TABLES.flatMap((t) =>
  roles.flatMap((r) =>
    privs.map(
      (p) =>
        `SELECT '${t}','${r}','${p}',has_table_privilege('${r}','public.${t}','${p}')::text`,
    ),
  ),
).join(" UNION ALL ");

const rows = psql(selects);

const failures = [];
for (const [table, role, priv, hasStr] of rows) {
  const has = hasStr === "t" || hasStr === "true";
  const want = EXPECTED[role][priv];
  if (has !== want) {
    failures.push(
      `  ✗ ${role} ${has ? "HAS" : "MISSING"} ${priv} on public.${table} (expected: ${want ? "HAS" : "MISSING"})`,
    );
  }
}

// RLS moet ook aan staan.
const rls = psql(
  `SELECT c.relname, c.relrowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('${TABLES.join("','")}')`,
);
for (const [table, on] of rls) {
  if (on !== "t" && on !== "true") {
    failures.push(`  ✗ RLS is UIT op public.${table} (verwacht: aan)`);
  }
}

if (failures.length) {
  console.error(
    `✗ Mail skin GRANTs check faalde (${failures.length} probleem${failures.length === 1 ? "" : "en"}):`,
  );
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `✓ Mail skin GRANTs OK — ${TABLES.length} tabellen × ${roles.length} rollen gecontroleerd, RLS aan.`,
);
