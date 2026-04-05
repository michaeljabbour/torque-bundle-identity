import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Identity from '../logic.js';
import { createMockData, createMockEvents } from './helpers.js';

describe('Identity bundle', () => {
  let identity, data, events;

  beforeEach(() => {
    data = createMockData();
    events = createMockEvents();
    identity = new Identity({
      data,
      events,
      config: { config: { jwt_secret: 'test-secret', jwt_ttl_seconds: 60 } },
      coordinator: {},
    });
  });

  describe('signUp', () => {
    it('creates a user and returns tokens', () => {
      const result = identity.signUp({ email: 'test@test.com', password: 'password123', name: 'Test' });
      assert.ok(result.user);
      assert.equal(result.user.email, 'test@test.com');
      assert.equal(result.user.name, 'Test');
      assert.ok(result.access_token);
      assert.ok(result.refresh_token);
      assert.ok(!result.user.password_digest); // not leaked
    });

    it('rejects duplicate emails', () => {
      identity.signUp({ email: 'dupe@test.com', password: 'password123', name: 'A' });
      const result = identity.signUp({ email: 'dupe@test.com', password: 'password123', name: 'B' });
      assert.ok(result.error);
      // Fix 4: generic message — should NOT confirm the email is taken
      assert.ok(result.error.includes('Unable to create account'));
    });

    // Invalid email, short password, missing name are structural validations
    // now handled by the manifest validate: block — not tested inline here.

    it('publishes identity.user.authenticated event', () => {
      identity.signUp({ email: 'test@test.com', password: 'password123', name: 'Tester' });
      const authEvent = events._published.find(e => e.name === 'identity.user.authenticated');
      assert.ok(authEvent);
      assert.equal(authEvent.payload.email, 'test@test.com');
    });
  });

  describe('signIn', () => {
    it('authenticates with correct credentials', () => {
      identity.signUp({ email: 'test@test.com', password: 'password123', name: 'Test' });
      const result = identity.signIn({ email: 'test@test.com', password: 'password123' });
      assert.ok(result.user);
      assert.ok(result.access_token);
    });

    it('rejects wrong password', () => {
      identity.signUp({ email: 'test@test.com', password: 'correctpass', name: 'Test' });
      const result = identity.signIn({ email: 'test@test.com', password: 'wrong' });
      assert.ok(result.error);
      assert.ok(result.error.includes('Invalid'));
    });

    it('rejects unknown email', () => {
      const result = identity.signIn({ email: 'nobody@test.com', password: 'pass' });
      assert.ok(result.error);
    });

    it('publishes identity.auth.failed on wrong password', () => {
      identity.signUp({ email: 'test@test.com', password: 'correctpass', name: 'Test' });
      identity.signIn({ email: 'test@test.com', password: 'wrong' });
      const failEvent = events._published.find(e => e.name === 'identity.auth.failed');
      assert.ok(failEvent, 'identity.auth.failed event not published');
      assert.equal(failEvent.payload.email, 'test@test.com');
      assert.equal(failEvent.payload.reason, 'wrong_password');
    });

    it('publishes identity.auth.failed on unknown email', () => {
      identity.signIn({ email: 'ghost@test.com', password: 'pass' });
      const failEvent = events._published.find(e => e.name === 'identity.auth.failed');
      assert.ok(failEvent, 'identity.auth.failed event not published');
      assert.equal(failEvent.payload.email, 'ghost@test.com');
      assert.equal(failEvent.payload.reason, 'unknown_email');
    });
  });

  describe('validateToken', () => {
    it('validates a valid token', () => {
      const signup = identity.signUp({ email: 'test@test.com', password: 'password123', name: 'Tester' });
      const user = identity.validateToken(signup.access_token);
      assert.ok(user);
      assert.equal(user.email, 'test@test.com');
    });

    it('returns null for invalid token', () => {
      const user = identity.validateToken('garbage-token');
      assert.equal(user, null);
    });

    it('returns null for a token whose JTI has been individually revoked', () => {
      const signup = identity.signUp({ email: 'revoke@test.com', password: 'password123', name: 'Revoke' });
      // Token is valid before revocation
      assert.ok(identity.validateToken(signup.access_token));

      // Decode the JTI from the access token without verifying (split base64)
      const payloadB64 = signup.access_token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      // Insert a JTI-specific revocation record
      data.insert('revoked_tokens', {
        jti: payload.jti,
        user_id: payload.sub,
        revoked_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });

      assert.equal(identity.validateToken(signup.access_token), null);
    });

    it('returns null after revokeUserSessions (user-level revocation)', () => {
      const signup = identity.signUp({ email: 'sessions@test.com', password: 'password123', name: 'Sessions' });
      assert.ok(identity.validateToken(signup.access_token));

      identity.revokeUserSessions(signup.user.id);

      assert.equal(identity.validateToken(signup.access_token), null);
    });
  });

  describe('revokeUserSessions', () => {
    it('deletes all refresh tokens for the user', () => {
      const signup = identity.signUp({ email: 'r@test.com', password: 'password123', name: 'R' });
      const userId = signup.user.id;

      // Create a second session by signing in again
      identity.signIn({ email: 'r@test.com', password: 'password123' });

      const before = data.query('refresh_tokens', { user_id: userId });
      assert.equal(before.length, 2);

      identity.revokeUserSessions(userId);

      const after = data.query('refresh_tokens', { user_id: userId });
      assert.equal(after.length, 0);
    });

    it('returns { revoked: N } with the count of deleted refresh tokens', () => {
      const signup = identity.signUp({ email: 'count@test.com', password: 'password123', name: 'Count' });
      identity.signIn({ email: 'count@test.com', password: 'password123' });
      identity.signIn({ email: 'count@test.com', password: 'password123' });

      const result = identity.revokeUserSessions(signup.user.id);
      assert.equal(result.revoked, 3);
    });

    it('inserts a user-level revocation entry in revoked_tokens', () => {
      const signup = identity.signUp({ email: 'entry@test.com', password: 'password123', name: 'Entry' });
      const userId = signup.user.id;

      identity.revokeUserSessions(userId);

      const entries = data.query('revoked_tokens', { jti: `user:${userId}` });
      assert.equal(entries.length, 1);
      assert.equal(entries[0].user_id, userId);
    });

    it('publishes identity.session.revoked event', () => {
      const signup = identity.signUp({ email: 'evt@test.com', password: 'password123', name: 'Evt' });
      identity.revokeUserSessions(signup.user.id);

      const evt = events._published.find(e => e.name === 'identity.session.revoked');
      assert.ok(evt, 'identity.session.revoked event not published');
      assert.equal(evt.payload.user_id, signup.user.id);
      assert.equal(typeof evt.payload.revoked_count, 'number');
    });

    it('is exposed via interfaces()', () => {
      const ifaces = identity.interfaces();
      assert.ok(ifaces.revokeUserSessions, 'revokeUserSessions not in interfaces');

      const signup = identity.signUp({ email: 'iface@test.com', password: 'password123', name: 'Iface' });
      const result = ifaces.revokeUserSessions({ userId: signup.user.id });
      assert.ok(typeof result.revoked === 'number');
    });
  });

  describe('session limits', () => {
    it('caps refresh tokens at maxSessions (default 10) — sign up + 12 sign-ins yields 10 tokens', () => {
      identity.signUp({ email: 'limits@test.com', password: 'password123', name: 'Limits' });
      for (let i = 0; i < 12; i++) {
        identity.signIn({ email: 'limits@test.com', password: 'password123' });
      }
      const userId = data.query('users', { email: 'limits@test.com' })[0].id;
      const remaining = data.query('refresh_tokens', { user_id: userId });
      assert.equal(remaining.length, 10);
    });

    it('respects a custom max_sessions config', () => {
      // Create an identity instance with max_sessions = 3
      const smallIdentity = new Identity({
        data: createMockData(),
        events: createMockEvents(),
        config: { config: { jwt_secret: 'test-secret', jwt_ttl_seconds: 60, max_sessions: 3 } },
        coordinator: {},
      });
      smallIdentity.signUp({ email: 'small@test.com', password: 'password123', name: 'Small' });
      for (let i = 0; i < 5; i++) {
        smallIdentity.signIn({ email: 'small@test.com', password: 'password123' });
      }
      const userId = smallIdentity.data.query('users', { email: 'small@test.com' })[0].id;
      const remaining = smallIdentity.data.query('refresh_tokens', { user_id: userId });
      assert.equal(remaining.length, 3);
    });
  });

  describe('interfaces', () => {
    it('exposes getUser and validateToken', () => {
      const ifaces = identity.interfaces();
      assert.ok(ifaces.getUser);
      assert.ok(ifaces.validateToken);
    });

    it('getUser returns user by id', () => {
      const signup = identity.signUp({ email: 'test@test.com', password: 'password123', name: 'Test' });
      const user = identity.getUser(signup.user.id);
      assert.equal(user.name, 'Test');
      assert.ok(!user.password_digest);
    });

    it('getUser returns null for unknown id', () => {
      assert.equal(identity.getUser('nonexistent'), null);
    });
  });
});
