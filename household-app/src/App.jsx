import { useEffect, useState } from 'react'
import {
  ArrowDownUp,
  ChartNoAxesCombined,
  Cloud,
  Home,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  User,
} from 'lucide-react'
import Transactions from './Transactions.jsx'
import Dashboard from './Dashboard.jsx'
import Settings from './Settings.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { setActiveHouseholdId } from './database.js'
import { syncHouseholdFromCloud } from './services/syncService.js'
import './App.css'

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Transactions', icon: ArrowDownUp },
  { label: 'Settings', icon: SettingsIcon },
]

function AppContent() {
  const {
    user,
    household,
    households,
    switchHousehold,
    signOut,
    loading,
    isConfigured,
  } = useAuth()
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [isManualSyncing, setIsManualSyncing] = useState(false)

  useEffect(() => {
    if (household?.id) {
      setActiveHouseholdId(household.id)
      syncHouseholdFromCloud(household.id)
    } else {
      setActiveHouseholdId('default')
    }
  }, [household?.id])

  const handleManualSync = async () => {
    if (!household?.id) return
    setIsManualSyncing(true)
    try {
      await syncHouseholdFromCloud(household.id)
    } finally {
      setIsManualSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="spinner"></div>
        <p>Menyiapkan sesi akun & rumah tangga...</p>
      </div>
    )
  }

  // If Supabase is configured and user is not logged in -> Show Login/Register
  if (isConfigured && !user) {
    return <AuthScreen />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <ChartNoAxesCombined size={20} />
          </span>
          <span>
            <strong>KEUANGAN RUMAH</strong>
            <small>Multi-Akun & Household</small>
          </span>
        </div>

        {/* Current Household & User Badge */}
        <div className="household-badge">
          <div className="household-badge-header">
            <span className="household-icon">
              <Home size={15} />
            </span>
            <div className="household-info">
              <strong className="household-name">
                {household?.name || 'Mode Offline (Lokal)'}
              </strong>
              <small className="household-role">
                {user ? user.email : 'Belum Terhubung Cloud'}
              </small>
            </div>
          </div>

          {households && households.length > 1 && (
            <div className="household-switch-container">
              <label htmlFor="household-select">Pilih Rumah Tangga:</label>
              <select
                id="household-select"
                value={household?.id || ''}
                onChange={(e) => switchHousehold(e.target.value)}
                className="household-select"
              >
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {isConfigured && user && (
            <div className="household-actions">
              <button
                type="button"
                className="sync-btn"
                onClick={handleManualSync}
                disabled={isManualSyncing}
                title="Sinkronkan dengan Cloud"
              >
                <RefreshCw
                  size={13}
                  className={isManualSyncing ? 'spinning' : ''}
                />
                <span>{isManualSyncing ? 'Sinkron...' : 'Sync Cloud'}</span>
              </button>
              <button
                type="button"
                className="logout-btn"
                onClick={() => signOut()}
                title="Keluar dari akun"
              >
                <LogOut size={13} />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>

        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Navigasi utama" className="main-navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              aria-current={activeTab === label ? 'page' : undefined}
              className={`nav-item ${activeTab === label ? 'active' : ''}`}
              key={label}
              onClick={() => setActiveTab(label)}
              type="button"
            >
              <Icon aria-hidden="true" size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {!isConfigured && (
          <div className="cloud-notice-banner">
            <Cloud size={16} />
            <span>
              <strong>Mode Offline:</strong> Supabase belum dikonfigurasi. Data
              disimpan di browser lokal. Pasang <code>VITE_SUPABASE_URL</code> &{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> di <code>.env</code> untuk
              mengaktifkan multi-akun.
            </span>
          </div>
        )}

        <header className="topbar">
          <div>
            <p className="eyebrow">
              {household ? household.name : 'KEUANGAN RUMAH TANGGA'}
            </p>
            <h1>{activeTab}</h1>
          </div>
        </header>

        {activeTab === 'Transactions' ? (
          <Transactions onNavigateSettings={() => setActiveTab('Settings')} />
        ) : activeTab === 'Settings' ? (
          <Settings />
        ) : (
          <Dashboard
            onNavigateSettings={() => setActiveTab('Settings')}
            onNavigateTransactions={() => setActiveTab('Transactions')}
          />
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
