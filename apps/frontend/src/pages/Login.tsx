import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('dokter@icu.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err, 'Gagal masuk. Periksa email & password.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-dot" />
          ICU Monitor
        </div>
        <div className="muted">Sistem Pemantauan Pasien — Healthcare Big Data</div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@icu.test"
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="error-text">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <div className="hint-box">
          <strong>Akun demo</strong>
          <br />
          dokter@icu.test · perawat@icu.test · admin@icu.test
          <br />
          Password: <code>password123</code>
        </div>
      </div>
    </div>
  );
}
