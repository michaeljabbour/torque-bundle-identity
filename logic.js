import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { RevokeAccessIntent } from './intents/RevokeAccess/intent.js';

export default class Identity {
  constructor({ data, events, config, coordinator }) {
    this.data = data;
    this.events = events;
    this.config = config;
    this.coordinator = coordinator;
    const secret = config.config?.jwt_secret;
    if (!secret) {
      throw new Error(
        '[identity] jwt_secret is required. Set AUTH_SECRET in your environment.'
      );
    }
    if (secret === 'change-me' && process.env.NODE_ENV === 'production') {
      throw new Error(
        '[identity] jwt_secret must not be "change-me" in production. ' +
        'Set AUTH_SECRET to a strong random value.'
      );
    }
    if (secret === 'change-me') {
      console.warn('[identity] WARNING: using default jwt_secret "change-me". Set AUTH_SECRET to a strong value before deploying.');
    }
    this.jwtSecret = secret;
    this.jwtTtl = config.config?.jwt_ttl_seconds || 3600;
    this.refreshTtl = config.config?.refresh_ttl_seconds || 86400;
    this.maxSessions = config.config?.max_sessions || 10;
  }

  intents() {
    return {
      RevokeAccess: RevokeAccessIntent,
    };
  }

  interfaces() {
    return {
      getUser: ({ userId }) => this.getUser(userId),
      validateToken: ({ token }) => this.validateToken(token),
      revokeUserSessions: ({ userId }) => this.revokeUserSessions(userId),
    };
  }

  routes() {
    return {
      signUp: (ctx) => {
        const result = this.signUp(ctx.body);
        return result.error ? { status: 422, data: result } : { status: 201, data: result };
      },
      signIn: (ctx) => {
        const result = this.signIn(ctx.body);
        return result.error ? { status: 401, data: result } : { status: 200, data: result };
      },
      refreshToken: (ctx) => {
        const result = this.refreshToken(ctx.body.refresh_token);
        return result.error ? { status: 401, data: result } : { status: 200, data: result };
      },
      me: (ctx) => {
        return { status: 200, data: ctx.currentUser };
      },
    };
  }

  getUser(userId) {
    const user = this.data.find('users', userId);
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  signUp({ email, password, name }) {
    // Structural validation (email format, password presence, name presence) now handled by manifest validate: block

    const existing = this.data.query('users', { email });
    // Generic message — don't confirm whether the email is registered
    if (existing.length > 0) return { error: 'Unable to create account. Please try a different email or sign in.' };

    const passwordDigest = bcrypt.hashSync(password, 10);
    const user = this.data.insert('users', {
      email,
      password_digest: passwordDigest,
      name: name || email.split('@')[0],
      role: 'user',
    });

    const tokens = this._createTokens(user);
    this.events.publish('identity.user.authenticated', { user_id: user.id, email: user.email }, { publisher: 'identity' });
    return { user: this._safeUser(user), ...tokens };
  }

  signIn({ email, password }) {
    const users = this.data.query('users', { email });
    const user = users[0];

    // Fix 2: always run bcrypt to prevent timing side-channels
    const dummyHash = '$2b$10$invalidhashpadding000000000000000000000000000000';
    const digest = user?.password_digest || dummyHash;
    const valid = bcrypt.compareSync(password || '', digest);

    // Fix 3: publish a security event so monitoring can detect brute force
    if (!user || !valid) {
      this.events.publish('identity.auth.failed', {
        email,
        reason: !user ? 'unknown_email' : 'wrong_password',
        timestamp: new Date().toISOString(),
      }, { publisher: 'identity' });
      return { error: 'Invalid credentials' };
    }

    const tokens = this._createTokens(user);
    this.events.publish('identity.user.authenticated', { user_id: user.id, email: user.email }, { publisher: 'identity' });
    return { user: this._safeUser(user), ...tokens };
  }

  refreshToken(refreshJti) {
    const tokens = this.data.query('refresh_tokens', { jti: refreshJti });
    const rt = tokens[0];
    if (!rt) return { error: 'Invalid refresh token' };
    if (rt.expires_at && new Date(rt.expires_at) < new Date()) return { error: 'Refresh token expired' };

    const user = this.data.find('users', rt.user_id);
    if (!user) return { error: 'User not found' };

    this.data.delete('refresh_tokens', rt.id);
    const newTokens = this._createTokens(user);
    return { user: this._safeUser(user), ...newTokens };
  }

  validateToken(token) {
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      const user = this.data.find('users', payload.sub);
      if (!user) return null;

      // Check both JTI-specific and user-level revocation
      const revoked = this.data.query('revoked_tokens', { jti: payload.jti });
      const userRevoked = this.data.query('revoked_tokens', { jti: `user:${payload.sub}` });
      if (revoked.length > 0 || userRevoked.length > 0) return null;

      return this._safeUser(user);
    } catch {
      return null;
    }
  }

  revokeUserSessions(userId) {
    // Delete all refresh tokens for this user
    const tokens = this.data.query('refresh_tokens', { user_id: userId });
    for (const rt of tokens) {
      this.data.delete('refresh_tokens', rt.id);
    }
    // Add a user-level revocation entry so any live access tokens fail validation
    this.data.insert('revoked_tokens', {
      jti: `user:${userId}`,
      user_id: userId,
      revoked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.jwtTtl * 1000).toISOString(),
    });
    this.events.publish('identity.session.revoked', { user_id: userId, revoked_count: tokens.length }, { publisher: 'identity' });
    return { revoked: tokens.length };
  }

  setupSubscriptions(eventBus) {}

  _createTokens(user) {
    // Session limit: enforce max concurrent refresh tokens per user
    const maxSessions = this.maxSessions;
    const existing = this.data.query('refresh_tokens', { user_id: user.id }, { order: 'created_at' });
    if (existing.length >= maxSessions) {
      // Delete the oldest session(s) to make room for the new one
      const toRemove = existing.slice(0, existing.length - maxSessions + 1);
      for (const old of toRemove) {
        this.data.delete('refresh_tokens', old.id);
      }
    }

    const jti = uuid();
    const exp = Math.floor(Date.now() / 1000) + this.jwtTtl;
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, jti, exp },
      this.jwtSecret
    );

    const refreshJti = uuid();
    this.data.insert('refresh_tokens', {
      user_id: user.id,
      jti: refreshJti,
      expires_at: new Date(Date.now() + this.refreshTtl * 1000).toISOString(),
    });

    this.events.publish('identity.session.created', { user_id: user.id, jti }, { publisher: 'identity' });
    return { access_token: accessToken, refresh_token: refreshJti };
  }

  _safeUser(user) {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
