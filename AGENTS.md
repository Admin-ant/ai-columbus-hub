# Architecture
- Shared quarter-closure triggers must read table-specific fields through JSON or inside a separate table-only branch; PostgreSQL can resolve record fields in boolean expressions even for other tables.
- Match inbound mail to contacts with organization-scoped database triggers; UI and ingestion must share the same linking rules.
- Never label a mailbox refresh as fetching mail unless a real mailbox connection is configured and exercised.
- Branded mails show the company with the uploaded brand mark on a dark header bar, served from the app's own domain; the mark's white lettering only reads on dark surfaces, so never place it on white.
- Templates flagged as HTML keep their markup through sending, test mails and previews (escaped only where a value is inserted); appointment confirmations take their layout from the template chosen in mail settings, otherwise from the app's built-in design.
- Appointment email wording is locale-aware for Dutch, English and German; configured HTML retains its layout while built-in AVC wording is localized and customer messages/rescheduling notices are inserted at send time so saved templates cannot discard them.- Untrusted mail HTML is shown only via SafeMailFrame (DOMPurify + sandboxed iframe, external images opt-in); never render body_html with dangerouslySetInnerHTML.
- Mail attachments are referenced by storage object id from the browser; the server resolves paths via resolve_mail_attachments and requires the organization folder prefix.
- The inbound mail webhook accepts only valid Svix signatures and assigns mail solely by recipient address; unknown recipients are ignored, never assigned to a default organization.
- Mail senders are re-checked server-side against the mail service's verified domains on every send.
