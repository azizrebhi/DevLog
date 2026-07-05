import { useState } from 'react';
import { login, register } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [mode, setMode]         = useState('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/dashboard');
      } else {
        await register(email, password);
        await login(email, password);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>📝</div>
        <h1 style={styles.title}>DevLog</h1>
        <p style={styles.subtitle}>Track your dev sessions</p>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setMode('login'); setError(''); }}
          >Login</button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setMode('register'); setError(''); }}
          >Register</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={styles.input}
          />
          <label style={styles.label}>Password</label>
          <input
            type="password"
            required
            placeholder={mode === 'register' ? 'Min 8 characters' : 'Password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Please wait...' : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0f1e',
  },
  card: {
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
  },
  logo: { fontSize: '40px', marginBottom: '8px' },
  title: { margin: '0 0 4px', fontSize: '24px', fontWeight: '700', color: '#f9fafb' },
  subtitle: { margin: '0 0 28px', color: '#9ca3af', fontSize: '14px' },
  tabs: {
    display: 'flex',
    gap: '0',
    background: '#111827',
    borderRadius: '8px',
    padding: '4px',
    marginBottom: '24px',
  },
  tab: {
    flex: 1,
    padding: '8px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  tabActive: {
    background: '#374151',
    color: '#f9fafb',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '0', textAlign: 'left' },
  label: { fontSize: '13px', color: '#9ca3af', marginBottom: '6px', marginTop: '16px' },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#111827',
    color: '#f9fafb',
    fontSize: '14px',
    outline: 'none',
  },
  btn: {
    marginTop: '24px',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#6366f1',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  error: { color: '#ef4444', fontSize: '13px', margin: '12px 0 0' },
};
