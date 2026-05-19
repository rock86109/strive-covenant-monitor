"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts"

export type DashboardData = {
  kpis: {
    total: number
    approvalRate: number
    flagRate: number
    rejectRate: number
    avgDE: number
    avgReviewMinutes: number
  }
  deDistribution: Array<{
    bucket: string
    Approve: number
    Flag: number
    Reject: number
  }>
  weeklyVolume: Array<{
    week: string
    sessions: number
  }>
  stepTimes: Array<{
    step: string
    avgMinutes: number
  }>
  recentSessions: Array<{
    id: string
    borrowerName: string | null
    debtToEquityRatio: number | null
    decision: string | null
    completedAt: string | null
    documentType: string | null
  }>
  scanQualityData: {
    good: { Approve: number; Flag: number; Reject: number }
    poor: { Approve: number; Flag: number; Reject: number }
    goodFRRate: number
    poorFRRate: number
    uplift: number
  }
}

const DECISION_COLORS = {
  Approve: "#22c55e",
  Flag: "#f59e0b",
  Reject: "#ef4444",
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-gray-400">—</span>
  const styles: Record<string, string> = {
    Approve: "bg-green-100 text-green-800",
    Flag: "bg-amber-100 text-amber-800",
    Reject: "bg-red-100 text-red-800",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[decision] ?? "bg-gray-100 text-gray-700"}`}>
      {decision}
    </span>
  )
}

export default function DashboardCharts({ data }: { data: DashboardData }) {
  const { kpis, deDistribution, weeklyVolume, stepTimes, recentSessions, scanQualityData } = data

  const scanQualityChartData = [
    {
      quality: "Good Scan",
      Approve: scanQualityData.good.Approve,
      Flag: scanQualityData.good.Flag,
      Reject: scanQualityData.good.Reject,
    },
    {
      quality: "Poor Scan",
      Approve: scanQualityData.poor.Approve,
      Flag: scanQualityData.poor.Flag,
      Reject: scanQualityData.poor.Reject,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Covenant Monitor</p>
          <h1 className="text-xl font-bold text-gray-900">COO Dashboard</h1>
        </div>
        <a href="/" className="text-sm text-blue-600 hover:underline">← Back to Workflow</a>
      </header>

      <main className="px-8 py-8 max-w-7xl mx-auto space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Total Reviews" value={kpis.total.toLocaleString()} sub="Last 6 months" />
          <KpiCard label="Approval Rate" value={`${kpis.approvalRate}%`} />
          <KpiCard label="Flag Rate" value={`${kpis.flagRate}%`} />
          <KpiCard label="Reject Rate" value={`${kpis.rejectRate}%`} />
          <KpiCard label="Avg D/E Ratio" value={kpis.avgDE.toFixed(2)} sub="Portfolio average" />
          <KpiCard label="Avg Review Time" value={`${kpis.avgReviewMinutes}m`} sub="End-to-end" />
        </div>

        {/* Strategic Insight Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">Strategic Insight · The Next Module</p>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Build an Automated OCR Pre-processor — poor scans are driving {scanQualityData.uplift}% more rejections
            </h2>
            <p className="text-sm text-gray-600">
              Documents flagged as poor-quality result in a <strong>{scanQualityData.poorFRRate}%</strong> Flag/Reject rate vs{" "}
              <strong>{scanQualityData.goodFRRate}%</strong> for clean scans. These are not riskier loans — they are data entry errors
              caused by illegible documents. An OCR pre-processor would catch transcription errors upstream, preventing
              pipeline stalls and misclassified approvals.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-4xl font-bold text-amber-600">+{scanQualityData.uplift}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Flag/Reject uplift</p>
            <p className="text-xs text-gray-400">Poor vs Good scan quality</p>
          </div>
        </div>

        {/* Scan Quality Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Scan Quality Impact on Decisions</h2>
          <p className="text-xs text-gray-400 mb-4">
            Poor-quality document submissions correlate with significantly higher Flag/Reject rates
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scanQualityChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="quality" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Approve" stackId="a" fill={DECISION_COLORS.Approve} />
                <Bar dataKey="Flag" stackId="a" fill={DECISION_COLORS.Flag} />
                <Bar dataKey="Reject" stackId="a" fill={DECISION_COLORS.Reject} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-4">
              {(["Good Scan", "Poor Scan"] as const).map((label) => {
                const row = label === "Good Scan" ? scanQualityData.good : scanQualityData.poor
                const t = row.Approve + row.Flag + row.Reject
                const frRate = label === "Good Scan" ? scanQualityData.goodFRRate : scanQualityData.poorFRRate
                const isPoor = label === "Poor Scan"
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`font-semibold ${isPoor ? "text-red-600" : "text-green-700"}`}>{label}</span>
                      <span className={`font-bold ${isPoor ? "text-red-600" : "text-green-700"}`}>
                        {frRate}% Flag/Reject
                      </span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                      {t > 0 && (
                        <>
                          <div style={{ width: `${(row.Approve / t) * 100}%`, background: DECISION_COLORS.Approve }} />
                          <div style={{ width: `${(row.Flag / t) * 100}%`, background: DECISION_COLORS.Flag }} />
                          <div style={{ width: `${(row.Reject / t) * 100}%`, background: DECISION_COLORS.Reject }} />
                        </>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>{row.Approve} Approve</span>
                      <span>{row.Flag} Flag</span>
                      <span>{row.Reject} Reject</span>
                      <span className="ml-auto">{t} total</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* D/E Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Decision Outcomes by D/E Ratio</h2>
            <p className="text-xs text-gray-400 mb-4">Stacked by underwriter decision per leverage bucket</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deDistribution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Approve" stackId="a" fill={DECISION_COLORS.Approve} />
                <Bar dataKey="Flag" stackId="a" fill={DECISION_COLORS.Flag} />
                <Bar dataKey="Reject" stackId="a" fill={DECISION_COLORS.Reject} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly Volume */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Weekly Review Volume</h2>
            <p className="text-xs text-gray-400 mb-4">Completed covenant sessions per week</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={weeklyVolume} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={2} fill="url(#volumeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Step Time Analysis */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Avg Time per Workflow Step</h2>
            <p className="text-xs text-gray-400 mb-4">From telemetry — underwriter time-on-task (minutes)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stepTimes} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="m" />
                <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} min`, "Avg time"]} />
                <Bar dataKey="avgMinutes" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Risk Profile Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Portfolio Risk Profile</h2>
              <p className="text-xs text-gray-400 mb-4">D/E ratio band breakdown — completed reviews</p>
            </div>
            <div className="space-y-3">
              {deDistribution.map((row) => {
                const total = row.Approve + row.Flag + row.Reject
                const pct = kpis.total > 0 ? Math.round((total / kpis.total) * 100) : 0
                return (
                  <div key={row.bucket}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{row.bucket}</span>
                      <span className="text-gray-400">{total} ({pct}%)</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                      {total > 0 && (
                        <>
                          <div style={{ width: `${(row.Approve / total) * 100}%`, background: DECISION_COLORS.Approve }} />
                          <div style={{ width: `${(row.Flag / total) * 100}%`, background: DECISION_COLORS.Flag }} />
                          <div style={{ width: `${(row.Reject / total) * 100}%`, background: DECISION_COLORS.Reject }} />
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Approve</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Flag</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Reject</span>
            </div>
          </div>
        </div>

        {/* Recent Sessions Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Reviews</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-6 py-3 text-left">Borrower</th>
                  <th className="px-6 py-3 text-left">Document Type</th>
                  <th className="px-6 py-3 text-right">D/E Ratio</th>
                  <th className="px-6 py-3 text-center">Decision</th>
                  <th className="px-6 py-3 text-right">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-900">{s.borrowerName ?? "—"}</td>
                    <td className="px-6 py-3 text-gray-500">{s.documentType ?? "—"}</td>
                    <td className="px-6 py-3 text-right font-mono text-gray-700">
                      {s.debtToEquityRatio != null ? s.debtToEquityRatio.toFixed(2) : "—"}
                    </td>
                    <td className="px-6 py-3 text-center"><DecisionBadge decision={s.decision} /></td>
                    <td className="px-6 py-3 text-right text-gray-400">
                      {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
