# Add payment & contact info to invoice PDFs

## Problem
Generated invoice PDFs (downloaded & emailed) only show organization name + VAT number. Missing IBAN, business address, KvK number, and email — required on Dutch invoices and needed by clients to pay.

Root cause: `organizations` table has no columns for these fields, so `buildPdf()` in `src/routes/_authenticated/invoices.$invoiceId.tsx` can't populate them, and `src/lib/invoice-pdf.ts` silently skips them (conditional rendering).

## Changes

### 1. Database migration
Add columns to `public.organizations`:
- `address_line1 text`
- `address_line2 text`
- `postal_code text`
- `city text`
- `country text` (default 'Nederland')
- `email text`
- `phone text`
- `kvk_number text`
- `iban text`
- `bic text`

### 2. Organization settings UI
Extend the existing organization/settings page with a form to edit these fields (holding_admin / company_admin only, per existing RLS).

### 3. Wire into PDF
In `src/routes/_authenticated/invoices.$invoiceId.tsx` `buildPdf()`, pass the new fields into `InvoicePdfData`:
- `organization_address` (composed from address_line1/2, postal_code, city, country)
- `organization_email`
- `organization_kvk`
- `organization_iban`
- (optionally `organization_bic`, `organization_phone`)

`src/lib/invoice-pdf.ts` already renders these conditionally — no changes needed there beyond confirming labels.

### 4. Same for expense/purchase-invoice PDFs
Apply the same enrichment in `src/lib/expense-pdf.ts` consumers so exported purchase invoice PDFs also show sender details consistently.

## Verification
- Fill org settings, download an invoice PDF → IBAN/address/KvK visible.
- Email an invoice → attached PDF contains the same info.
- Existing invoices with no org data filled still render (fields remain optional).
