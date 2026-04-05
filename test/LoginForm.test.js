import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import LoginForm from '../ui/LoginForm.js';

const baseData = { email: 'user@example.com', password: 'secret', error: '' };
const baseActions = { onFieldChange: () => {}, onSubmit: () => {} };

describe('LoginForm', () => {
  it('returns a stack descriptor as root', () => {
    const result = LoginForm({ data: baseData, actions: baseActions });
    assert.equal(result.type, 'stack');
    assert.equal(result.props.spacing, 3);
  });

  it('contains heading text (h5, "Sign in")', () => {
    const result = LoginForm({ data: baseData, actions: baseActions });
    const heading = result.children.find(
      c => c.type === 'text' && c.props.variant === 'h5'
    );
    assert.ok(heading, 'heading text descriptor not found');
    assert.equal(heading.props.content, 'Sign in');
    assert.deepStrictEqual(heading.props.sx, { fontWeight: 500 });
  });

  it('contains email and password text-field descriptors with correct values', () => {
    const data = { email: 'a@b.com', password: 'pw123', error: '' };
    const result = LoginForm({ data, actions: baseActions });

    const emailField = result.children.find(
      c => c.type === 'text-field' && c.props.name === 'email'
    );
    assert.ok(emailField, 'email text-field not found');
    assert.equal(emailField.props.label, 'Email');
    assert.equal(emailField.props.type, 'email');
    assert.equal(emailField.props.value, 'a@b.com');

    const passwordField = result.children.find(
      c => c.type === 'text-field' && c.props.name === 'password'
    );
    assert.ok(passwordField, 'password text-field not found');
    assert.equal(passwordField.props.label, 'Password');
    assert.equal(passwordField.props.type, 'password');
    assert.equal(passwordField.props.value, 'pw123');
  });

  it('contains submit button (label "Sign in", variant "contained")', () => {
    const result = LoginForm({ data: baseData, actions: baseActions });
    const button = result.children.find(c => c.type === 'button');
    assert.ok(button, 'button descriptor not found');
    assert.equal(button.props.label, 'Sign in');
    assert.equal(button.props.variant, 'contained');
    assert.equal(button.props.fullWidth, true);
  });

  it('includes alert when error is present', () => {
    const data = { email: '', password: '', error: 'Invalid credentials' };
    const result = LoginForm({ data, actions: baseActions });
    const alert = result.children.find(c => c.type === 'alert');
    assert.ok(alert, 'alert descriptor not found when error is present');
    assert.equal(alert.props.severity, 'error');
    assert.equal(alert.props.content, 'Invalid credentials');
  });

  it('excludes alert when error is empty', () => {
    const data = { email: '', password: '', error: '' };
    const result = LoginForm({ data, actions: baseActions });
    const alert = result.children.find(c => c.type === 'alert');
    assert.equal(alert, undefined, 'alert should not appear when no error');
  });

  it('passes onChange and onSubmit from actions', () => {
    const onFieldChange = () => {};
    const onSubmit = () => {};
    const actions = { onFieldChange, onSubmit };
    const result = LoginForm({ data: baseData, actions });

    const emailField = result.children.find(
      c => c.type === 'text-field' && c.props.name === 'email'
    );
    assert.strictEqual(emailField.props.onChange, onFieldChange);

    const passwordField = result.children.find(
      c => c.type === 'text-field' && c.props.name === 'password'
    );
    assert.strictEqual(passwordField.props.onChange, onFieldChange);

    const button = result.children.find(c => c.type === 'button');
    assert.strictEqual(button.props.onClick, onSubmit);
  });
});
