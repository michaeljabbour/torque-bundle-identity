import { Stack, Text, TextField, Button, Alert } from './ui-kit.js';

export default function LoginForm({ data, actions }) {
  return Stack({ spacing: 3 }, [
    Text({ variant: 'h5', content: 'Sign in', sx: { fontWeight: 500 } }),
    data.error ? Alert({ severity: 'error', content: data.error }) : null,
    TextField({ label: 'Email', type: 'email', name: 'email', value: data.email, onChange: actions.onFieldChange }),
    TextField({ label: 'Password', type: 'password', name: 'password', value: data.password, onChange: actions.onFieldChange }),
    Button({ label: 'Sign in', variant: 'contained', fullWidth: true, onClick: actions.onSubmit }),
  ].filter(Boolean));
}
