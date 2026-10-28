# Architecture
- Match inbound mail to contacts with organization-scoped database triggers; UI and ingestion must share the same linking rules.
- Never label a mailbox refresh as fetching mail unless a real mailbox connection is configured and exercised.
- Branded mails carry the company name as a text logo, not a hosted image: the image was illegible on the dark header bar and its URL depended on a preview asset path.