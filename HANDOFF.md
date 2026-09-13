# UKE — integration handoff

## Current implementation

- Migration 0008 applied: WhatsApp phone permissions link to UKE users; assistant responses are audited separately.
- Normal linked users can query approved read templates; only actual `super_admin` can add a company via `/firma-ekle` JSON. No WhatsApp update/delete operation exists.
- Assistant currently uses deterministic database answers for two explicit query templates. AI provider integration and WhatsApp response dispatch remain pending; do not describe these as completed.
- Existing contacts are no longer required for authorized staff to query the assistant; access comes from the linked UKE user and account project.

- Existing tenant changes were present before integration work; preserve them.
- n8n Compose definition exists; Docker has not been started or validated.
- Migration 0005 applied: integration receipts, review queue, client keys and activity external ID.
- Signed n8n event endpoint supports required context fields and transactional receipt/activity creation.
- Review queue is read-only at `/crm/review`, scoped by organization and active project.
- Migration 0006 applied: adds LinkedIn and sample-sent enum values without rewriting old records.
- Eight stages are the default CRM editing options. Historical statuses remain selectable only for records already carrying them and remain visible in the pipeline.
- CRM update now calls the existing role authorization helper and rejects invalid status input.

## Outstanding work

- Verify webhook concurrency, duplicate payload conflicts and tenant rejection against PostgreSQL using rollback-only fixtures. Existing DB suites have DELETE cleanup; do not run them under the user's no-delete constraint.
- Add durable processing error history and retry/review resolution workflow; current review UI only lists pending events.
- Configure project client keys explicitly for new projects. Existing migration populated project-based keys, not a full client entity.
- Migration 0007 applied: account-scoped communication tables. WhatsApp signature/handshake, permissions, message/status ingestion, mail normalized webhook, thread matching, suppression and dry-run preparation implemented.
- `/crm/messages` supports account configuration, enable/disable, authorized numbers, do-not-contact and dry-run preparation; `/crm/review` also lists channel review items.
- Real Gmail/Graph/SMTP connections are delegated to n8n provider adapters and have NOT been connected. Live sending is disabled regardless of credentials.
- WhatsApp `/ai` requests check explicit AI permission and enter configuration-required review; no AI provider is connected.
- 46 unit tests passed; rollback-only communication integration test passed (no DELETE cleanup). TypeScript and production build passed. Account/message page verified in browser on port 3001.
- Docker installation/runtime, n8n startup and signed end-to-end verification remain pending.
- WSL is missing; `wsl.exe --install --no-distribution --no-launch` failed. Docker remains unavailable.
- No real outgoing messages have been sent.

Never commit real secrets, remove user changes, delete database records, or rerun completed phases.
