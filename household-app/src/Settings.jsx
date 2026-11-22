import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Download, Plus, Trash2, Upload } from 'lucide-react'
import { TABLE_NAMES } from './database.js'
import {
  createDatabaseBackup,
  getBackupFilename,
  restoreDatabaseBackup,
  validateDatabaseBackup,
} from './services/backupService.js'
import {
  addPeriod,
  deletePeriod,
  getCurrentPeriod,
  subscribePeriodData,
} from './services/periodService.js'

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.'
}

function Settings() {
  const [period, setPeriod] = useState(getCurrentPeriod)
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [backupError, setBackupError] = useState('')
  const [backupNotice, setBackupNotice] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [pendingBackup, setPendingBackup] = useState(null)
  const [backupCounts, setBackupCounts] = useState(null)
  const backupFileInput = useRef(null)

  useEffect(() => {
    const subscription = subscribePeriodData(
      (nextPeriods) => {
        setPeriods(nextPeriods)
        setLoadError('')
        setLoading(false)
      },
      (error) => {
        setLoadError(getErrorMessage(error))
        setLoading(false)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setActionError('')
    setSaving(true)

    try {
      await addPeriod(period)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    if (item.transactionCount > 0) {
      setActionError(
        `Periode ${item.label} memiliki ${item.transactionCount} transaksi dan tidak dapat dihapus.`,
      )
      return
    }
    if (!window.confirm(`Hapus periode ${item.label}?`)) return

    setActionError('')
    try {
      await deletePeriod(item.value)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleExportBackup() {
    setBackupError('')
    setBackupNotice('')
    setBackupBusy(true)

    try {
      const backup = await createDatabaseBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = getBackupFilename(new Date(backup.backupDate))
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setBackupNotice('Backup berhasil dibuat dan diunduh ke perangkat ini.')
    } catch (error) {
      setBackupError(getErrorMessage(error))
    } finally {
      setBackupBusy(false)
    }
  }

  async function handleBackupFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setBackupError('')
    setBackupNotice('')
    setPendingBackup(null)
    setBackupCounts(null)
    if (!file) return

    try {
      const backup = JSON.parse(await file.text())
      const counts = validateDatabaseBackup(backup)
      setPendingBackup(backup)
      setBackupCounts(counts)
    } catch (error) {
      setBackupError(`File backup tidak valid: ${getErrorMessage(error)}`)
    }
  }

  async function handleRestoreBackup() {
    if (!pendingBackup) return
    const confirmed = window.confirm(
      'Restore akan menggantikan seluruh data lokal saat ini dengan data dari backup. Tindakan ini tidak dapat dibatalkan. Lanjutkan?',
    )
    if (!confirmed) return

    setBackupError('')
    setBackupNotice('')
    setBackupBusy(true)
    try {
      await restoreDatabaseBackup(pendingBackup)
      setPendingBackup(null)
      setBackupCounts(null)
      setBackupNotice('Restore berhasil. Data lokal telah dipulihkan dari backup.')
    } catch (error) {
      setBackupError(`Restore gagal; data lokal sebelumnya tetap dipertahankan. ${getErrorMessage(error)}`)
    } finally {
      setBackupBusy(false)
    }
  }

  return (
    <section className="master-page settings-page">
      <div className="page-toolbar">
        <div>
          <h2>Settings</h2>
          <p>Kelola bulan dan tahun yang tersedia untuk pencatatan.</p>
        </div>
      </div>

      <section aria-labelledby="add-period-heading" className="settings-panel">
        <div className="dashboard-section-title">
          <div>
            <h3 id="add-period-heading">Tambah periode</h3>
            <p>Periode baru bisa ditambahkan untuk bulan dan tahun apa pun.</p>
          </div>
        </div>
        <form className="settings-period-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Bulan dan tahun *</span>
            <input
              onChange={(event) => setPeriod(event.target.value)}
              required
              type="month"
              value={period}
            />
          </label>
          <button className="primary-button" disabled={saving} type="submit">
            <Plus aria-hidden="true" size={17} />
            {saving ? 'Menyimpan...' : 'Tambah periode'}
          </button>
        </form>
        <p className="settings-delete-note">
          Periode yang sudah memiliki transaksi tidak dapat dihapus.
        </p>
      </section>

      <section aria-labelledby="database-backup-heading" className="settings-panel">
        <div className="dashboard-section-title">
          <div>
            <h3 id="database-backup-heading">Backup &amp; Restore Database</h3>
            <p>
              Simpan atau pulihkan seluruh data aplikasi melalui file JSON lokal.
              File tidak diunggah ke server atau layanan cloud.
            </p>
          </div>
        </div>
        <div className="settings-backup-actions">
          <button
            className="primary-button"
            disabled={backupBusy}
            onClick={handleExportBackup}
            type="button"
          >
            <Download aria-hidden="true" size={17} />
            {backupBusy ? 'Memproses...' : 'Export Backup'}
          </button>
          <button
            className="secondary-button"
            disabled={backupBusy}
            onClick={() => backupFileInput.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" size={17} />
            Import Backup
          </button>
          <input
            accept=".json,application/json"
            aria-label="Pilih file backup JSON"
            hidden
            onChange={handleBackupFileChange}
            ref={backupFileInput}
            type="file"
          />
        </div>
        {backupError && <p className="inline-error" role="alert">{backupError}</p>}
        {backupNotice && <p className="backup-success" role="status">{backupNotice}</p>}
        {pendingBackup && backupCounts && (
          <div className="backup-preview" role="status">
            <strong>Backup valid — ringkasan record</strong>
            <ul>
              {TABLE_NAMES.map((tableName) => (
                <li key={tableName}>
                  <span>{tableName}</span>
                  <strong>{backupCounts[tableName]}</strong>
                </li>
              ))}
            </ul>
            <p>
              Peringatan: restore akan menggantikan seluruh data lokal saat ini.
              Konfirmasi akan diminta sebelum proses dimulai.
            </p>
            <button
              className="primary-button"
              disabled={backupBusy}
              onClick={handleRestoreBackup}
              type="button"
            >
              {backupBusy ? 'Memulihkan...' : 'Restore Database'}
            </button>
          </div>
        )}
      </section>

      {actionError && <p className="inline-error" role="alert">{actionError}</p>}
      {loadError && (
        <div className="error-panel" role="alert">
          <span>Daftar periode gagal dimuat: {loadError}</span>
        </div>
      )}

      <section aria-label="Daftar periode" className="settings-panel">
        <div className="dashboard-section-title">
          <div>
            <h3>Periode tersedia</h3>
            <p>{periods.length} periode</p>
          </div>
        </div>
        {loading ? (
          <div aria-live="polite" className="loading-state">Memuat periode...</div>
        ) : periods.length === 0 ? (
          <div className="empty-state settings-empty">
            <CalendarDays aria-hidden="true" size={30} />
            <h3>Belum ada periode</h3>
            <p>Tambahkan bulan dan tahun untuk mulai mencatat transaksi.</p>
          </div>
        ) : (
          <ul className="settings-period-list">
            {periods.map((item) => (
              <li key={item.value}>
                <div>
                  <strong>{item.label}</strong>
                  <span>
                    {item.transactionCount
                      ? `${item.transactionCount} transaksi · tidak dapat dihapus`
                      : 'Belum ada transaksi'}
                  </span>
                </div>
                <button
                  aria-label={`Hapus periode ${item.label}`}
                  className="icon-button danger-icon"
                  disabled={item.transactionCount > 0}
                  onClick={() => handleDelete(item)}
                  title={
                    item.transactionCount > 0
                      ? 'Periode memiliki transaksi dan tidak dapat dihapus'
                      : 'Hapus periode'
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export default Settings
