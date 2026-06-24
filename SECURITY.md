# Security Controls

## Authentication

- **JWT access tokens**: 60-minute expiry, signed with HS256 using `SECRET_KEY`
- **Refresh tokens**: 30-day expiry, stored in `refresh_tokens` table with hash (bcrypt)
- **Password hashing**: bcrypt via passlib
- **Invite tokens**: Time-limited signed JWTs (7-day), type-checked in decode
- **No shared passwords**: Each household member has separate credentials

## Authorization

- All endpoints require a valid Bearer token (except `/auth/*` and `/health`)
- `get_current_user` dependency extracts + validates the JWT
- `get_household_for_user` ensures the user belongs to the household they're querying
- Account visibility is enforced at the API level: `is_shared || owner_id == user.id`
- Role-based permission checks: household settings require `owner` role

## Data Protection

| Data | Protection |
|------|-----------|
| Passwords | bcrypt hashed, never stored in plain text |
| Bank access tokens | Should be encrypted at rest using KMS in production (TODO: add encryption) |
| Refresh tokens | Stored as bcrypt hash |
| JWT signing key | Read from `SECRET_KEY` env var, never hardcoded |
| PII (emails, names) | Stored in PostgreSQL; encrypt columns at rest in production |

## Bank Security

- **Read-only**: Only Plaid `transactions` product is requested — no payment capability
- **Token storage**: Access tokens are stored server-side only, never exposed to frontend
- **Disconnection**: Users can revoke access at any time (soft-delete of Account record; call Plaid item/remove in production)
- **No credential storage**: We never see or store users' bank login credentials

## Audit Logging

`AuditLog` records:
- User login events
- Invitation sent / accepted / declined
- Account linked / disconnected
- Household membership changes (role change, member removed)
- Permission changes (account shared/unshared)

Query audit logs via `GET /api/v1/audit/logs` (admin only in production).

## CORS

Origins are whitelisted via `CORS_ORIGINS` env var. In production, set this to your frontend domain only.

## Rate Limiting (TODO for production)

Add `slowapi` rate limiting middleware:
- `/auth/login`: 5 requests/minute per IP
- `/auth/register`: 3 requests/minute per IP
- `/chat/message`: 30 requests/minute per user

## Input Validation

All input is validated by Pydantic v2 models before reaching business logic. SQLAlchemy parameterized queries prevent SQL injection. No raw SQL string interpolation.

## Session Security

- Refresh tokens are invalidated on explicit logout
- Adding a `revoked` flag + token hash allows server-side revocation
- In production, store refresh tokens in Redis with TTL for fast invalidation

## Environment Variables

Never commit `.env`. The `.env.example` documents all required variables. All secrets must be provided via environment variables or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).

## Security Checklist for Production

- [ ] Generate a strong `SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(32))"`)
- [ ] Enable PostgreSQL TLS/SSL
- [ ] Encrypt bank access tokens at rest
- [ ] Set `CORS_ORIGINS` to your exact frontend domain
- [ ] Enable rate limiting middleware
- [ ] Set up CSP headers in Next.js
- [ ] Enable HTTPS-only cookies if moving to cookie-based auth
- [ ] Configure log aggregation for audit logs
- [ ] Run `bandit -r backend/` for Python security static analysis
- [ ] Enable Plaid's production webhook signature verification
