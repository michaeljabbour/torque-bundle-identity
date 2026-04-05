---
meta:
  name: identity-expert
  description: "Expert on the identity bundle — authentication, JWT sessions, user management."
  modes:
    - name: implement
      trigger: "work on identity"
    - name: debug
      trigger: "debug auth"
  context:
    include:
      - context/DOMAIN_CONVENTIONS.md
---

# Identity Bundle — Agent Guide

## What this bundle does
Authentication, user management, and JWT session lifecycle. Root bundle — no dependencies.

## Domain model
- **Users**: email (unique), password (bcrypt-hashed), name, role
- **Refresh tokens**: per-user with JTI and expiration
- Access tokens: short-lived JWTs. Refresh tokens: long-lived opaque UUIDs.

## Anti-patterns
- Never expose `password_digest` — `_safeUser()` strips it
- Never import identity from other bundles — use `coordinator.call('identity', 'getUser', { userId })`
- Never hardcode JWT secrets — from mount plan config

## Interfaces
- `getUser({ userId })` → `{ id, email, name, role }` or null
- `validateToken({ token })` → user object or null
