# Architecture
- Match inbound mail to contacts with organization-scoped database triggers; UI and ingestion must share the same linking rules.
- Never label a mailbox refresh as fetching mail unless a real mailbox connection is configured and exercised.
- Branded mails show the company with the uploaded brand mark on a dark header bar, served from the app's own domain; the mark's white lettering only reads on dark surfaces, so never place it on white.