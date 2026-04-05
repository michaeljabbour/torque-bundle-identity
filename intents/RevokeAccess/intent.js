import { Intent } from '@torquedev/core';
import { RevokeAccessBehavior } from './behavior.js';

export const RevokeAccessIntent = new Intent({
  name: 'RevokeAccess',
  description: 'Revoke a user\'s active sessions or access. Requires admin privileges and human confirmation before execution.',
  trigger: 'Admin asks to revoke access, terminate sessions, or lock out a user',
  successCriteria: [
    'The target user is identified and verified',
    'Human confirmation is obtained before revocation',
    'All specified sessions are terminated',
    'A confirmation summary is provided',
  ],
  behavior: RevokeAccessBehavior,
});