"use client"

import { useState, useEffect, useRef } from "react"

type WorkflowFormData = {
  documentType: string
  borrowerName: string
  borrowerEmail: string
  income: string
  scanQuality: string
  totalDebt: string
  totalEquity: string
  debtToEquityRatio: number | null
  decision: string
  decisionNotes: string
}

type Props = {
  sessionId: string
  initialData: WorkflowFormData
  initialStep: number
}

const STEPS = [
  { num: 1, label: "Ingest" },
  { num: 2, label: "Validate" },
  { num: 3, label: "Analyze" },
  { num: 4, label: "Decide" },
] as const

const INPUT =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"

function computeRatio(debt: string, equity: string): number | null {
  const d = parseFloat(debt)
  const e = parseFloat(equity)
  if (isNaN(d) || isNaN(e) || e === 0) return null
  return Math.round((d / e) * 100) / 100
}

export default function WorkflowClient({ sessionId, initialData, initialStep }: Props) {
  const [step, setStep] = useState(initialStep)
  const [formData, setFormData] = useState<WorkflowFormData>(initialData)
  const [nudges, setNudges] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  const stepEnterTime = useRef(Date.now())
  const fieldChanges = useRef(0)
  const sidecarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function fireEvent(payload: Record<string, unknown>) {
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ covenantSessionId: sessionId, ...payload }),
    }).catch(() => {})
  }

  async function refreshNudges(currentStep: number, currentData: WorkflowFormData) {
    const ratio =
      currentStep >= 3
        ? computeRatio(currentData.totalDebt, currentData.totalEquity)
        : currentData.debtToEquityRatio
    try {
      const res = await fetch("/api/sidecar-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: currentStep, data: { ...currentData, debtToEquityRatio: ratio } }),
      })
      const json = await res.json()
      const incoming: string[] = json.nudges ?? []
      setNudges(incoming)
      if (incoming.length > 0) {
        fireEvent({ eventType: "sidecar_shown", step: currentStep })
      }
    } catch {}
  }

  useEffect(() => {
    stepEnterTime.current = Date.now()
    fieldChanges.current = 0
    fireEvent({ eventType: "step_enter", step })
    refreshNudges(step, formData)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(name: keyof WorkflowFormData, value: string) {
    const prev = formData[name]
    const next = { ...formData, [name]: value }
    setFormData(next)
    fieldChanges.current++
    fireEvent({
      eventType: "field_change",
      step,
      fieldName: name,
      oldValue: String(prev ?? ""),
      newValue: value,
    })
    if (sidecarDebounce.current) clearTimeout(sidecarDebounce.current)
    sidecarDebounce.current = setTimeout(() => refreshNudges(step, next), 700)
  }

  async function handleNext() {
    if (step === 4 && !formData.decision) return
    setSaving(true)

    const timeOnStepMs = Date.now() - stepEnterTime.current
    fireEvent({ eventType: "step_exit", step, timeOnStepMs, fieldChangeCount: fieldChanges.current })

    let patch: Record<string, unknown> = {}
    if (step === 1) {
      patch = {
        documentType: formData.documentType || null,
        borrowerName: formData.borrowerName || null,
        borrowerEmail: formData.borrowerEmail || null,
        income: formData.income ? parseFloat(formData.income) : null,
        scanQuality: formData.scanQuality || null,
        currentStep: 2,
      }
    } else if (step === 2) {
      patch = {
        totalDebt: formData.totalDebt ? parseFloat(formData.totalDebt) : null,
        totalEquity: formData.totalEquity ? parseFloat(formData.totalEquity) : null,
        currentStep: 3,
      }
    } else if (step === 3) {
      const ratio = computeRatio(formData.totalDebt, formData.totalEquity)
      setFormData(prev => ({ ...prev, debtToEquityRatio: ratio }))
      patch = { debtToEquityRatio: ratio, currentStep: 4 }
    } else if (step === 4) {
      patch = {
        decision: formData.decision,
        decisionNotes: formData.decisionNotes || null,
        status: "completed",
        completedAt: new Date().toISOString(),
      }
      fireEvent({ eventType: "decision_made", step: 4, metadata: { decision: formData.decision } })
    }

    try {
      await fetch("/api/workflow/step", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, data: patch }),
      })
    } catch {}

    setSaving(false)
    if (step === 4) {
      setCompleted(true)
    } else {
      setStep(s => s + 1)
    }
  }

  if (completed) {
    const isApproved = formData.decision === "Approved"
    const isFlagged = formData.decision === "Flagged"
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center max-w-md w-full">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${
              isApproved ? "bg-green-100" : isFlagged ? "bg-yellow-100" : "bg-red-100"
            }`}
          >
            <svg
              className={`w-8 h-8 ${isApproved ? "text-green-600" : isFlagged ? "text-yellow-600" : "text-red-600"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isApproved && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              )}
              {isFlagged && (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21l1.9-5.7a8.5 8.5 0 113.8 3.8z"
                />
              )}
              {!isApproved && !isFlagged && (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              )}
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">{formData.decision}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {formData.borrowerName || "Borrower"} · Covenant review complete
          </p>
          {formData.decisionNotes && (
            <p className="text-sm text-gray-400 bg-gray-50 rounded-lg p-3 text-left">{formData.decisionNotes}</p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-8 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start new review
          </button>
        </div>
      </div>
    )
  }

  const ratio = computeRatio(formData.totalDebt, formData.totalEquity)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="border-b bg-white px-8 py-4 flex-shrink-0">
        <nav className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              {i > 0 && (
                <div className={`h-px w-8 mx-3 ${step > i ? "bg-blue-600" : "bg-gray-200"}`} />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${
                    step >= s.num ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {step > s.num ? "✓" : s.num}
                </div>
                <span
                  className={`text-sm font-medium ${
                    step === s.num ? "text-blue-600" : step > s.num ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-lg">
            {step === 1 && <Step1 data={formData} onChange={updateField} inputCls={INPUT} />}
            {step === 2 && <Step2 data={formData} onChange={updateField} inputCls={INPUT} />}
            {step === 3 && <Step3 data={formData} ratio={ratio} />}
            {step === 4 && <Step4 data={formData} onChange={updateField} ratio={ratio} inputCls={INPUT} />}

            <div className="mt-8 flex gap-3">
              {step > 1 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ← Back
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={saving || (step === 4 && !formData.decision)}
                className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : step === 4 ? "Submit Decision" : "Next →"}
              </button>
            </div>
          </div>
        </main>

        <aside className="w-72 border-l bg-white overflow-y-auto flex-shrink-0">
          <div className="p-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Contextual Guidance
            </h3>
            {nudges.length === 0 ? (
              <p className="text-sm text-gray-300 italic">No alerts for current inputs.</p>
            ) : (
              <div className="space-y-3">
                {nudges.map((nudge, i) => (
                  <div
                    key={i}
                    className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-lg p-3 leading-relaxed"
                  >
                    {nudge}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ─── Step Components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Step1({
  data,
  onChange,
  inputCls,
}: {
  data: WorkflowFormData
  onChange: (k: keyof WorkflowFormData, v: string) => void
  inputCls: string
}) {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Document Ingestion</h2>
      <p className="text-sm text-gray-500 mb-6">
        Classify the borrower&apos;s financial documents and record key metadata.
      </p>
      <div className="space-y-4">
        <Field label="Document Type">
          <select
            value={data.documentType}
            onChange={e => onChange("documentType", e.target.value)}
            className={inputCls}
          >
            <option value="">Select type...</option>
            <option value="2023 Form 1065">2023 Form 1065</option>
            <option value="2022 Schedule K-1">2022 Schedule K-1</option>
            <option value="Handwritten Ledger">Handwritten Ledger</option>
          </select>
        </Field>
        <Field label="Borrower Name">
          <input
            type="text"
            value={data.borrowerName}
            onChange={e => onChange("borrowerName", e.target.value)}
            placeholder="e.g. Acme Partners LLC"
            className={inputCls}
          />
        </Field>
        <Field label="Borrower Email">
          <input
            type="email"
            value={data.borrowerEmail}
            onChange={e => onChange("borrowerEmail", e.target.value)}
            placeholder="contact@borrower.com"
            className={inputCls}
          />
        </Field>
        <Field label="Reported Income ($)">
          <input
            type="number"
            value={data.income}
            onChange={e => onChange("income", e.target.value)}
            placeholder="0"
            min="0"
            className={inputCls}
          />
        </Field>
        <Field label="Scan Quality">
          <div className="flex gap-2">
            {(["Good", "Poor"] as const).map(q => (
              <button
                key={q}
                type="button"
                onClick={() => onChange("scanQuality", q)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  data.scanQuality === q
                    ? q === "Good"
                      ? "bg-green-50 border-green-500 text-green-700"
                      : "bg-red-50 border-red-500 text-red-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </>
  )
}

function Step2({
  data,
  onChange,
  inputCls,
}: {
  data: WorkflowFormData
  onChange: (k: keyof WorkflowFormData, v: string) => void
  inputCls: string
}) {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Financial Validation</h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter the verified debt and equity figures from the borrower&apos;s documents.
      </p>
      <div className="space-y-4">
        <Field label="Total Debt ($)">
          <input
            type="number"
            value={data.totalDebt}
            onChange={e => onChange("totalDebt", e.target.value)}
            placeholder="0"
            min="0"
            className={inputCls}
          />
        </Field>
        <Field label="Total Equity ($)">
          <input
            type="number"
            value={data.totalEquity}
            onChange={e => onChange("totalEquity", e.target.value)}
            placeholder="0"
            min="0"
            className={inputCls}
          />
        </Field>
      </div>
    </>
  )
}

function Step3({ data, ratio }: { data: WorkflowFormData; ratio: number | null }) {
  const risk =
    ratio == null ? null : ratio > 3 ? "high" : ratio > 2 ? "elevated" : ratio > 1 ? "moderate" : "low"

  const riskStyles = {
    high: {
      card: "bg-red-50 border-red-200",
      value: "text-red-700",
      badge: "bg-red-100 text-red-700",
      label: "High Risk",
    },
    elevated: {
      card: "bg-yellow-50 border-yellow-200",
      value: "text-yellow-700",
      badge: "bg-yellow-100 text-yellow-700",
      label: "Elevated Risk",
    },
    moderate: {
      card: "bg-blue-50 border-blue-200",
      value: "text-blue-700",
      badge: "bg-blue-100 text-blue-700",
      label: "Moderate Risk",
    },
    low: {
      card: "bg-green-50 border-green-200",
      value: "text-green-700",
      badge: "bg-green-100 text-green-700",
      label: "Low Risk",
    },
  }
  const rs = risk ? riskStyles[risk] : null

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Covenant Analysis</h2>
      <p className="text-sm text-gray-500 mb-6">
        Review the calculated risk ratios before making your determination.
      </p>
      <div className="space-y-3">
        <div className="bg-gray-50 rounded-xl p-5 flex justify-between items-center">
          <span className="text-sm text-gray-500">Total Debt</span>
          <span className="font-semibold text-gray-900">
            {data.totalDebt ? `$${parseFloat(data.totalDebt).toLocaleString()}` : "—"}
          </span>
        </div>
        <div className="bg-gray-50 rounded-xl p-5 flex justify-between items-center">
          <span className="text-sm text-gray-500">Total Equity</span>
          <span className="font-semibold text-gray-900">
            {data.totalEquity ? `$${parseFloat(data.totalEquity).toLocaleString()}` : "—"}
          </span>
        </div>
        <div className={`rounded-xl p-5 border ${rs ? rs.card : "bg-gray-50 border-gray-200"}`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm text-gray-500">Debt-to-Equity Ratio</span>
            {rs && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rs.badge}`}>{rs.label}</span>
            )}
          </div>
          <p className={`text-4xl font-bold ${rs ? rs.value : "text-gray-400"}`}>
            {ratio != null ? ratio.toFixed(2) : "—"}
          </p>
        </div>
      </div>
    </>
  )
}

function Step4({
  data,
  onChange,
  ratio,
  inputCls,
}: {
  data: WorkflowFormData
  onChange: (k: keyof WorkflowFormData, v: string) => void
  ratio: number | null
  inputCls: string
}) {
  const decisions = [
    { value: "Approved", selected: "bg-green-50 border-green-500 text-green-700", label: "Approve" },
    { value: "Flagged", selected: "bg-yellow-50 border-yellow-500 text-yellow-700", label: "Flag" },
    { value: "Rejected", selected: "bg-red-50 border-red-500 text-red-700", label: "Reject" },
  ]

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Covenant Decision</h2>
      <p className="text-sm text-gray-500 mb-6">Submit your final compliance determination.</p>
      {ratio != null && (
        <div className="mb-5 bg-gray-50 rounded-lg px-4 py-3 flex justify-between text-sm">
          <span className="text-gray-500">D/E Ratio</span>
          <span className="font-semibold text-gray-900">{ratio.toFixed(2)}</span>
        </div>
      )}
      <div className="space-y-4">
        <Field label="Decision">
          <div className="flex gap-2">
            {decisions.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => onChange("decision", d.value)}
                className={`flex-1 py-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                  data.decision === d.value
                    ? d.selected
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <textarea
            value={data.decisionNotes}
            onChange={e => onChange("decisionNotes", e.target.value)}
            placeholder="Add context or justification..."
            rows={4}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>
    </>
  )
}
