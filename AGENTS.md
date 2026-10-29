# Architecture
- Match inbound mail to contacts with organization-scoped database triggers; UI and ingestion must share the same linking rules.
- Never label a mailbox refresh as fetching mail unless a real mailbox connection is configured and exercised.
- Branded mails show the company with the uploaded brand mark on a dark header bar, served from the app's own domain; the mark's white lettering only reads on dark surfaces, so never place it on white.
- Templates flagged as HTML keep their markup through sending, test mails and previews (escaped only where a value is inserted); appointment confirmations take their layout from the template chosen in mail settings, otherwise from the app's built-in design.
- Appointment email wording is locale-aware for Dutch, English and German; configured HTML retains its layout while built-in AVC wording is localized and customer messages/rescheduling notices are inserted at send time so saved templates cannot discard them.