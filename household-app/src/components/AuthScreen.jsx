import { useState } from 'react'
import {
  ChartNoAxesCombined,
  Home,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

export default function AuthScreen() {
  const { signIn, signUp, isConfigured } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isRegister) {
        if (!fullName.trim()) {
          throw new Error('Nama lengkap wajib diisi.')
        }
        await signUp(email, password, fullName.trim())
        setMessage(
          'Pendaftaran berhasil! Jika konfirmasi email diaktifkan di Supabase, silakan periksa inbox email Anda, atau langsung coba masuk.'
        )
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Terjadi kesalahan saat otentikasi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-icon">
            <ChartNoAxesCombined size={28} />
          </div>
          <h2>KEUANGAN RUMAH TANGGA</h2>
          <p className="auth-subtitle">
            Aplikasi manajemen keuangan keluarga multi-akun & multi-household
          </p>
        </div>

        {!isConfigured && (
          <div className="auth-alert warning">
            <p>
              <strong>⚠️ Supabase Belum Terhubung:</strong> Variabel lingkungan{' '}
              <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>{' '}
              belum dipasang di file <code>.env</code> atau Vercel.
            </p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Silakan buat proyek Supabase gratis, jalankan script{' '}
              <code>supabase_schema.sql</code>, lalu pasang credentials-nya.
            </p>
          </div>
        )}

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isRegister ? 'active' : ''}`}
            onClick={() => {
              setIsRegister(false)
              setError('')
              setMessage('')
            }}
          >
            <LogIn size={16} />
            <span>Masuk</span>
          </button>
          <button
            type="button"
            className={`auth-tab ${isRegister ? 'active' : ''}`}
            onClick={() => {
              setIsRegister(true)
              setError('')
              setMessage('')
            }}
          >
            <UserPlus size={16} />
            <span>Daftar Baru</span>
          </button>
        </div>

        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <div className="form-group">
              <label htmlFor="fullName">Nama Pemilik / Keluarga</label>
              <div className="input-with-icon">
                <User size={18} className="field-icon" />
                <input
                  id="fullName"
                  type="text"
                  placeholder="Misal: Farhan / Keluarga Pratama"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={isRegister}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Alamat Email</label>
            <div className="input-with-icon">
              <Mail size={18} className="field-icon" />
              <input
                id="email"
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Kata Sandi</label>
            <div className="input-with-icon">
              <Lock size={18} className="field-icon" />
              <input
                id="password"
                type="password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading || !isConfigured}
          >
            {loading ? (
              'Memproses...'
            ) : isRegister ? (
              <>
                <Home size={18} />
                <span>Buat Akun & Rumah Tangga Baru</span>
              </>
            ) : (
              <>
                <LogIn size={18} />
                <span>Masuk ke Rumah Tangga</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-features">
          <div className="feature-item">
            <ShieldCheck size={18} className="feature-icon" />
            <span>
              <strong>Pemisahan Data Aman:</strong> Akun 1 dan Akun 2 mengelola
              data rumah tangga yang berbeda secara terisolasi.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
