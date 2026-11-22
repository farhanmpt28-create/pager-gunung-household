import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Wallet,
} from 'lucide-react'
import {
  calculateMonthlyFinancialSummary,
  calculateMonthlyExpenseTrend,
  subscribeDashboardData,
} from './services/dashboardService.js'
import {
  formatPeriodLabel,
  getTransactionPeriod,
  listPeriodOptions,
} from './services/periodService.js'

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Gagal memuat data dashboard.'
}

function Dashboard({ onNavigateTransactions, onNavigateSettings }) {
  const [period, setPeriod] = useState('')
  const [data, setData] = useState({
    transactions: [],
    categories: [],
    periods: [],
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const subscription = subscribeDashboardData(
      (nextData) => {
        setData(nextData)
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

  const periodOptions = useMemo(
    () => listPeriodOptions(data.periods),
    [data.periods],
  )
  const selectedPeriod = periodOptions.some(({ value }) => value === period)
    ? period
    : periodOptions[0]?.value ?? ''
  const summary = useMemo(
    () => calculateMonthlyFinancialSummary(data.transactions, selectedPeriod),
    [data.transactions, selectedPeriod],
  )
  const expenseTrend = useMemo(
    () => calculateMonthlyExpenseTrend(data.transactions, selectedPeriod),
    [data.transactions, selectedPeriod],
  )
  const maxMonthlyExpense = Math.max(
    0,
    ...expenseTrend.months.map(({ amount }) => amount),
  )
  const categoriesById = useMemo(
    () => new Map(data.categories.map((category) => [category.id, category.name])),
    [data.categories],
  )
  const history = useMemo(
    () =>
      [...summary.periodTransactions].sort(
        (a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
          b.id - a.id,
      ),
    [summary.periodTransactions],
  )

  return (
    <section className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">RINGKASAN KEUANGAN</p>
          <h2>Keuangan rumah tangga</h2>
        </div>
        <label className="dashboard-period">
          <span>Bulan dan tahun</span>
          <select
            aria-label="Bulan dan tahun ringkasan"
            disabled={!periodOptions.length}
            onChange={(event) => setPeriod(event.target.value)}
            value={selectedPeriod}
          >
            {!periodOptions.length && (
              <option value="">Belum ada periode tersedia</option>
            )}
            {periodOptions.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {loadError ? (
        <div className="error-panel" role="alert">
          <strong>Data dashboard gagal dimuat.</strong>
          <span>{loadError}</span>
        </div>
      ) : (
        <>
          <div className="dashboard-metric-grid">
            <article className="dashboard-metric-card balance">
              <div className="dashboard-metric-icon">
                <Wallet aria-hidden="true" size={19} />
              </div>
              <p>Saldo tahunan</p>
              <strong>{formatCurrency(summary.balance)}</strong>
            </article>
            <article className="dashboard-metric-card income">
              <div className="dashboard-metric-icon">
                <ArrowDownLeft aria-hidden="true" size={19} />
              </div>
              <p>Uang masuk {selectedPeriod && <span>· {formatPeriodLabel(selectedPeriod)}</span>}</p>
              <strong>{formatCurrency(summary.totalIncome)}</strong>
            </article>
            <article className="dashboard-metric-card expense">
              <div className="dashboard-metric-icon">
                <ArrowUpRight aria-hidden="true" size={19} />
              </div>
              <p>Uang keluar {selectedPeriod && <span>· {formatPeriodLabel(selectedPeriod)}</span>}</p>
              <strong>{formatCurrency(summary.totalExpense)}</strong>
            </article>
          </div>

          <section aria-labelledby="expense-trend-heading" className="dashboard-panel expense-trend-panel">
            <div className="dashboard-section-title">
              <div>
                <h3 id="expense-trend-heading">Tren Pengeluaran Bulanan</h3>
                <p>{selectedPeriod ? selectedPeriod.slice(0, 4) : 'Pilih periode di Settings'}</p>
              </div>
            </div>
            {selectedPeriod ? (
              <>
                <p aria-live="polite" className="expense-trend-comparison">
                  {expenseTrend.comparison.direction === 'increase'
                    ? `Pengeluaran naik ${expenseTrend.comparison.percentage}% dibanding bulan sebelumnya.`
                    : expenseTrend.comparison.direction === 'decrease'
                      ? `Pengeluaran turun ${expenseTrend.comparison.percentage}% dibanding bulan sebelumnya.`
                      : expenseTrend.comparison.direction === 'unchanged'
                        ? 'Tidak ada perubahan dibanding bulan sebelumnya.'
                        : 'Belum ada data pengeluaran bulan sebelumnya untuk perbandingan.'}
                </p>
                <div className="expense-trend-scroll">
                  <div aria-label={`Tren pengeluaran tahun ${selectedPeriod.slice(0, 4)}`} className="expense-trend-chart" role="list">
                    {expenseTrend.months.map(({ period: monthPeriod, label, amount }) => (
                      <div
                        aria-label={`${label} ${monthPeriod.slice(0, 4)}: ${formatCurrency(amount)}`}
                        className={`expense-trend-month ${monthPeriod === selectedPeriod ? 'selected' : ''}`}
                        key={monthPeriod}
                        role="listitem"
                      >
                        <span className="expense-trend-amount">{formatCurrency(amount)}</span>
                        <div className="expense-trend-track">
                          <span
                            className="expense-trend-bar"
                            style={{
                              height: maxMonthlyExpense
                                ? `${(amount / maxMonthlyExpense) * 100}%`
                                : '0%',
                            }}
                          />
                        </div>
                        <span className="expense-trend-label">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state dashboard-history-empty">
                <CalendarDays aria-hidden="true" size={30} />
                <h3>Belum ada periode untuk grafik</h3>
                <p>Tambahkan periode di Settings agar grafik pengeluaran dapat ditampilkan.</p>
                <button
                  className="secondary-button"
                  onClick={onNavigateSettings}
                  type="button"
                >
                  Buka Settings <ArrowRight aria-hidden="true" size={16} />
                </button>
              </div>
            )}
          </section>

          <section className="dashboard-panel dashboard-recent">
            <div className="dashboard-section-title">
              <div>
                <h3>Riwayat transaksi</h3>
                <p>{selectedPeriod ? formatPeriodLabel(selectedPeriod) : 'Belum ada periode tersedia'}</p>
              </div>
              <button
                className="dashboard-link-button"
                onClick={onNavigateTransactions}
                type="button"
              >
                Kelola transaksi <ArrowRight aria-hidden="true" size={15} />
              </button>
            </div>
            {loading ? (
              <div aria-live="polite" className="loading-state">
                Memuat transaksi...
              </div>
            ) : history.length ? (
              <div className="dashboard-recent-list">
                {history.map((transaction) => {
                  const isIncome = transaction.type === 'income'
                  const categoryName =
                    categoriesById.get(transaction.categoryId) ??
                    transaction.categoryName

                  return (
                    <article className="dashboard-recent-row" key={transaction.id}>
                      <span className={`recent-type-icon ${isIncome ? 'income' : 'expense'}`}>
                        {isIncome ? (
                          <ArrowDownLeft aria-hidden="true" size={17} />
                        ) : (
                          <ArrowUpRight aria-hidden="true" size={17} />
                        )}
                      </span>
                      <div className="recent-transaction-info">
                        <strong>{transaction.description}</strong>
                        <span>
                          {formatPeriodLabel(getTransactionPeriod(transaction))}
                          {!isIncome && categoryName ? ` · ${categoryName}` : ''}
                        </span>
                      </div>
                      <span className={`recent-transaction-type ${isIncome ? 'income' : 'expense'}`}>
                        {isIncome ? 'Masuk' : 'Keluar'}
                      </span>
                      <strong className={`recent-transaction-amount ${isIncome ? 'income' : 'expense'}`}>
                        {isIncome ? '+' : '−'} {formatCurrency(transaction.amount)}
                      </strong>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state dashboard-history-empty">
                <Wallet aria-hidden="true" size={30} />
                {selectedPeriod ? (
                  <>
                    <h3>Belum ada transaksi di bulan ini</h3>
                    <p>Tambahkan uang masuk atau uang keluar untuk mulai mencatat.</p>
                    <button
                      className="secondary-button"
                      onClick={onNavigateTransactions}
                      type="button"
                    >
                      Buka Transactions <ArrowRight aria-hidden="true" size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Belum ada periode tersedia</h3>
                    <p>Tambahkan periode melalui Settings untuk mulai mencatat.</p>
                    <button
                      className="secondary-button"
                      onClick={onNavigateSettings}
                      type="button"
                    >
                      Buka Settings <ArrowRight aria-hidden="true" size={16} />
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default Dashboard
