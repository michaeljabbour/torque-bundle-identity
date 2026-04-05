# @torquedev/bundle-identity

Authentication, JWT sessions, and user management. Part of the [Torque](https://github.com/torque-framework/torque) composable monolith framework.

Provides sign-up, sign-in, token refresh, and user introspection as a self-contained Torque bundle. Other bundles can call its interfaces to verify tokens and retrieve users without coupling to the underlying storage or cryptographic implementation.

## Schema

| Table | Column | Type | Constraints |
|-------|--------|------|-------------|
| `users` | `id` | `TEXT` | Primary key, UUID |
| `users` | `email` | `TEXT` | NOT NULL, unique |
| `users` | `password_digest` | `TEXT` | NOT NULL |
| `users` | `name` | `TEXT` | |
| `users` | `role` | `TEXT` | NOT NULL, default `'user'` |
| `refresh_tokens` | `id` | `TEXT` | Primary key, UUID |
| `refresh_tokens` | `user_id` | `TEXT` | NOT NULL, FK → `users.id` |
| `refresh_tokens` | `jti` | `TEXT` | NOT NULL, unique — JWT ID for revocation |
| `refresh_tokens` | `expires_at` | `TEXT` | NOT NULL — ISO 8601 timestamp |

## Events

**Published**

| Event | Payload | Description |
|-------|---------|-------------|
| `identity.user.authenticated` | `{ userId, email, role }` | Fired after a successful `sign_in`. |
| `identity.session.created` | `{ userId, jti, expiresAt }` | Fired when a new JWT access token and refresh token pair is issued (sign-in or refresh). |
| `identity.auth.failed` | `{ email, reason }` | Fired when authentication is attempted but fails (wrong password, unknown email, revoked token, etc.). |

## Interfaces

| Interface | Arguments | Returns | Description |
|-----------|-----------|---------|-------------|
| `getUser` | `{ userId }` | `{ id, email, name, role }` | Retrieve a user by ID. Returns `null` if not found. |
| `validateToken` | `{ token }` | `{ valid, userId, role, jti }` | Verify and decode a JWT access token. Returns `{ valid: false }` on expiry, bad signature, or revoked JTI. |
| `revokeUserSessions` | `{ userId }` | `{ revoked: number }` | Immediately invalidate all active refresh tokens for a user. Returns the count of tokens revoked. |

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/identity/sign_up` | Public | Register a new user. Body: `{ email, password, name? }`. Returns `{ user, accessToken, refreshToken }`. |
| `POST` | `/api/identity/sign_in` | Public | Authenticate with email + password. Returns `{ user, accessToken, refreshToken }`. |
| `POST` | `/api/identity/refresh` | Public (refresh token) | Exchange a valid refresh token for a new access token. Implements token rotation — the old refresh token is revoked and a new one is issued. |
| `GET` | `/api/identity/me` | Required | Return the currently authenticated user. Reads identity from the `authResolver`-resolved user on `req`. |

## Security

### JWT Enforcement

- The `jwt_secret` configuration key is **required**. Boot fails with a descriptive error if it is absent or empty.
- Access tokens are signed with HMAC-SHA256. Tokens signed with a different algorithm are rejected.
- Token expiry is enforced by the library; expired tokens return `{ valid: false }` from `validateToken` rather than throwing.

### Password Validation

Passwords are validated at sign-up with a minimum length of **8 characters**. Shorter passwords are rejected with a `422 Unprocessable Entity` response before any hashing occurs.

### Constant-Time Authentication

Password comparison uses **bcrypt** (`bcrypt.compare`), which is constant-time by design. This prevents timing attacks that could be used to determine whether an email address is registered.

### Token Revocation via JTI Blocklist

Every refresh token is issued with a unique JWT ID (`jti`). On refresh or explicit revocation:

1. The old `jti` is deleted from the `refresh_tokens` table.
2. `validateToken` checks the `jti` against the active token set; a missing or expired `jti` returns `{ valid: false }`.

This means tokens can be revoked immediately without waiting for their natural expiry.

### Session Limits

Each user may have at most **10 active refresh tokens** at a time. When a new session is created and the limit would be exceeded, the oldest token (by `expires_at`) is automatically revoked to make room. This bounds the storage footprint and limits the blast radius of credential theft.

## Intents

### RevokeAccess Intent

The bundle exposes a `RevokeAccess` intent that can be triggered by AI agents or automation workflows to forcibly sign out a user:

| Property | Value |
|----------|-------|
| Intent name | `RevokeAccess` |
| Trigger | `identity.suspicious_activity` or direct invocation |
| Description | Revoke all active sessions for a given user ID |
| Allowed tools | `identity.revokeUserSessions` |
| Success criteria | All refresh tokens for the user are deleted; `identity.session.revoked` event published |
| Human confirmation | Not required (automated security response) |

## Dependencies

None. The bundle has no `depends_on` declarations and does not call any other bundle's interfaces.

## Configuration

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `jwt_secret` | **Yes** | — | Secret string used to sign and verify JWT access tokens. Must be kept confidential. |
| `jwt_ttl_seconds` | No | `900` | Access token lifetime in seconds (default: 15 minutes). |
| `refresh_ttl_seconds` | No | `2592000` | Refresh token lifetime in seconds (default: 30 days). |

## Install

```bash
npm install @torquedev/bundle-identity
```

Or via git dependency:

```bash
npm install git+https://github.com/torque-framework/torque-bundle-identity.git
```

## Usage

Reference this bundle in a mount plan:

```yaml
bundles:
  identity:
    source: "git+https://github.com/torque-framework/torque-bundle-identity.git@main"
    config:
      jwt_secret: "${AUTH_SECRET}"
      jwt_ttl_seconds: 900
      refresh_ttl_seconds: 2592000
```

Other bundles that need to verify tokens or look up users declare the dependency:

```yaml
# In another bundle's manifest.yml
depends_on:
  - identity
```

And call the interfaces via the coordinator:

```js
const { valid, userId, role } = await coordinator.call('identity', 'validateToken', { token });
const user = await coordinator.call('identity', 'getUser', { userId });
```

## License

MIT — see [LICENSE](./LICENSE)
