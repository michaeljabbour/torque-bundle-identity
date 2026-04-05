import { Behavior } from '@torquedev/core';

export const RevokeAccessBehavior = new Behavior({
  persona: 'You are a security-focused access control agent. Verify the requesting user has admin privileges before revoking access. Always explain what sessions will be terminated and why.',
  allowedTools: [
    'identity.getUser',
    'identity.validateToken',
  ],
  requireHumanConfirmation: ['identity.revokeSession'],
});