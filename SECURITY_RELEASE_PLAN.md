# Security and release plan

## Current release status

**Not approved for production use with real service or personal data.**

The current API uses one shared `PATRUL_API_TOKEN` bearer secret for all four role endpoints. A client holding that secret can read and write every role record. This is authentication by shared secret, not per-person authentication or role authorization.

The role records are stored as JSONB in PostgreSQL. The application does not provide application-level encryption for those records. Excluding the exchange password field from snapshots does not encrypt the remaining work data.

## Required target architecture

1. Individual accounts mapped to exactly one authorized role (or an explicitly approved set of roles).
2. Passwords stored only as salted, slow password hashes; never as plaintext or reversible secrets.
3. Server-managed sessions using high-entropy opaque IDs, stored hashed in the database and delivered only in Secure, HttpOnly, SameSite cookies.
4. Login throttling, generic login errors, session expiry, logout and session revocation.
5. Every data read and write authorized on the server against the authenticated account's role. A client-supplied role or page name is never trusted.
6. CSRF protection for cookie-authenticated state-changing requests, strict origin policy, and security headers.
7. Audit events for authentication and sensitive data changes, without logging passwords, cookies, tokens or full personal records.
8. Tested backups and restore procedure, documented retention, incident response and least-privilege database credentials.
9. Remove the shared bearer token from browser code. Any machine credential must remain server-side and must not grant browser users cross-role access.

## Migration and compatibility safeguards

- Do not overwrite existing localStorage or PostgreSQL records during authentication migration.
- Keep the existing Production branch and deployment untouched until a separately deployed, isolated preview passes the acceptance tests.
- Back up the database before any schema/data migration and rehearse restore against a disposable database.
- Do not copy production secrets into CI. Integration tests use disposable credentials and a disposable PostgreSQL service.

## Release acceptance tests

- Anonymous requests cannot read or write any role.
- A user assigned to one role cannot read or write another role, even by changing the URL.
- Session cookies are HttpOnly, Secure in production, SameSite, expire, and can be revoked.
- Login rate limiting and CSRF protections are tested.
- Concurrent updates produce a conflict rather than silently overwriting data.
- Each role's read/write flows and cross-role document exchange are tested in a real browser.
- Backup restore is demonstrated and verified.
- Security and legal review confirms the actual deployment, data categories, processors, hosting region, access controls and applicable Russian personal-data obligations before real personal data is entered.

## Known limitations

Passing automated tests does not establish legal compliance, penetration-test clearance, browser compatibility, operational readiness or successful disaster recovery. Those require separate evidence and review.
