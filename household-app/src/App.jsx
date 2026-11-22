import {
  ArrowDownUp,
  ChartNoAxesCombined,
  LayoutDashboard,
  Settings as SettingsIcon,
} from 'lucide-react'
import Transactions from './Transactions.jsx'
import Dashboard from './Dashboard.jsx'
import Settings from './Settings.jsx'
import './App.css'

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Transactions', icon: ArrowDownUp },
  { label: 'Settings', icon: SettingsIcon },
]

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <ChartNoAxesCombined size={20} />
          </span>
          <span>
            <strong>KEUANGAN RUMAH</strong>
            <small>Pencatatan sederhana</small>
          </span>
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
        <header className="topbar">
          <div>
            <p className="eyebrow">KEUANGAN RUMAH TANGGA</p>
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

export default App
