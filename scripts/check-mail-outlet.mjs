#!/usr/bin/env node
// Regression test: /mail parent layout must render <Outlet /> for its
// child routes (mail/skins, mail/settings, mail/templates, mail/flow,
// mail/appointment-preview) instead of the inbox layout.
//
// This guards against a past bug where MailPage always rendered the
// inbox and the child routes were invisible.
//
// Run with: node scripts/check-mail-outlet.mjs (also wired as bun run test:mail-outlet)

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = "src/routes/_authenticated";
const PARENT = join(ROUTES_DIR, "mail.tsx");

const failures = [];

function fail(msg) {
  failures.push(msg);
}

// 1. Parent file exists and imports Outlet + useRouterState from the router.
const parent = readFileSync(PARENT, "utf8");
if (!/from\s+"@tanstack\/react-router"/.test(parent)) {
  fail(`${PARENT}: missing @tanstack/react-router import`);
}
if (!/\bOutlet\b[^;]*from\s+"@tanstack\/react-router"|import\s*{[^}]*\bOutlet\b[^}]*}\s*from\s*"@tanstack\/react-router"/.test(parent)) {
  fail(`${PARENT}: does not import { Outlet } from "@tanstack/react-router"`);
}
if (!/useRouterState/.test(parent)) {
  fail(`${PARENT}: does not import/use useRouterState to detect child matches`);
}

// 2. The MailPage component must gate on a child match and early-return <Outlet />
//    *before* any inbox rendering. We match the canonical pattern.
const mailPageMatch = parent.match(/function\s+MailPage\s*\(\s*\)\s*{([\s\S]*?)\n}/);
if (!mailPageMatch) {
  fail(`${PARENT}: MailPage component not found`);
} else {
  const body = mailPageMatch[1];
  const gateIdx = body.search(/if\s*\(\s*hasChildMatch\s*\)\s*return\s*<Outlet\s*\/>/);
  if (gateIdx === -1) {
    fail(
      `${PARENT}: MailPage is missing the required guard \`if (hasChildMatch) return <Outlet />;\``,
    );
  } else {
    // Anything that looks like inbox UI must appear AFTER the guard.
    const beforeGate = body.slice(0, gateIdx);
    if (/<[A-Za-z]/.test(beforeGate)) {
      fail(
        `${PARENT}: MailPage renders JSX before the <Outlet /> guard — child routes would be shadowed by the inbox.`,
      );
    }
    // The routeId check must scope to actual children of /mail, not the parent itself.
    const routeIdCheck =
      /routeId\.startsWith\(\s*["']\/_authenticated\/mail\/["']\s*\)/.test(parent) &&
      /routeId\s*!==?\s*["']\/_authenticated\/mail["']/.test(parent);
    if (!routeIdCheck) {
      fail(
        `${PARENT}: hasChildMatch must check routeId.startsWith("/_authenticated/mail/") AND exclude "/_authenticated/mail"`,
      );
    }
  }
}

// 3. Every discovered mail child route must actually exist as a file so the
//    parent guard has something to render. This surfaces broken renames.
const expectedChildren = readdirSync(ROUTES_DIR)
  .filter((f) => /^mail\.[^.]+\.tsx$/.test(f))
  .map((f) => `/_authenticated/${f.replace(/\.tsx$/, "").replace(/\./g, "/")}`);

if (expectedChildren.length === 0) {
  fail(`${ROUTES_DIR}: no mail.* child routes found — did the files move?`);
}

// 4. Sanity: at minimum skins and settings must be present (the two the user
//    hit the regression on).
for (const required of ["/_authenticated/mail/skins", "/_authenticated/mail/settings"]) {
  if (!expectedChildren.includes(required)) {
    fail(`Missing required child route file for ${required}`);
  }
}

if (failures.length) {
  console.error("❌ mail-outlet regression check failed:\n");
  for (const f of failures) console.error("  • " + f);
  console.error(
    `\nDiscovered child routes: ${expectedChildren.join(", ") || "(none)"}`,
  );
  process.exit(1);
}

console.log("✅ /mail parent layout correctly gates on <Outlet /> for child routes:");
for (const c of expectedChildren) console.log("   • " + c);
