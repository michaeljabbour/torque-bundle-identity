import { Context } from '@torquedev/core';

export const RevokeAccessContext = new Context('RevokeAccess', {
  schema: {
    user_id: 'uuid',
    email: 'string',
    reason: 'string',
    scope: 'string',
    session_id: 'uuid',
  },
  vectorize: ['email', 'reason'],
});