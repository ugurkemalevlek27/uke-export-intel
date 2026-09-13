# n8n provider workflows

Create one workflow per `communication_accounts` row. Provider nodes normalize
to the UKE communication event contract and call the account-specific endpoint.
Keep `external_event_id` and `provider_message_id` from the provider unchanged;
do not derive IDs from subject/body. Configure n8n retry-on-503 with exponential
backoff. Use the account's `<credential_prefix>_WEBHOOK_SECRET` only in the
signature Code node and keep it in n8n credentials/environment variables.

## Normalized event mapping

- Gmail / Microsoft Graph / IMAP: `incoming` and `outgoing`, with `thread_id`.
- Meta Cloud API: use the WhatsApp webhook endpoint; do not send Meta payloads to
  the mail endpoint.
- Delivery events: `direction=status`, original `provider_message_id`, and one of
  `sent`, `delivered`, `read`, `failed`, `bounce`, `unsubscribe`.

No provider credential or message send is configured in this repository.
