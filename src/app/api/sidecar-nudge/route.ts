import { db } from "@/lib/db"

type InsightButton = {
  label: string
  insight: string
  data: Record<string, string>
}

export async function POST(request: Request) {
  const { step, data } = await request.json()
  const nudges: string[] = []
  const buttons: InsightButton[] = []

  const isHandwritten = data.documentType === "Handwritten Ledger"
  const isPoorScan = data.scanQuality === "Poor"
  const debt = parseFloat(data.totalDebt)
  const equity = parseFloat(data.totalEquity)
  const loanAmount = parseFloat(data.loanAmount)
  const income = parseFloat(data.income)
  const ratio = typeof data.debtToEquityRatio === "number" ? data.debtToEquityRatio : null

  // Post-loan metrics (available once debt + equity + loanAmount are all known)
  const hasLoan = !isNaN(loanAmount) && loanAmount > 0
  const hasEquityVal = !isNaN(equity) && equity > 0
  const hasDebtVal = !isNaN(debt) && debt > 0
  const postLoanDE = hasLoan && hasDebtVal && hasEquityVal
    ? Math.round(((debt + loanAmount) / equity) * 100) / 100
    : null

  // ── Borrower history ────────────────────────────────────────────────────────
  if (data.borrowerEmail) {
    const history = await db.covenantSession.findMany({
      where: { borrowerEmail: data.borrowerEmail, status: "completed", decision: { not: null } },
      select: { decision: true, debtToEquityRatio: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 50,
    })

    if (history.length > 0) {
      const counts: Record<string, number> = { Approve: 0, Flag: 0, Reject: 0 }
      let deSum = 0, deCount = 0
      for (const s of history) {
        if (s.decision && s.decision in counts) counts[s.decision]++
        if (s.debtToEquityRatio != null) { deSum += s.debtToEquityRatio; deCount++ }
      }
      const avgDE = deCount > 0 ? (deSum / deCount).toFixed(2) : "—"
      const last = history[0]
      const lastDate = last.completedAt ? new Date(last.completedAt).toLocaleDateString() : "—"

      buttons.push({
        label: `View borrower history (${history.length} past session${history.length > 1 ? "s" : ""})`,
        insight: `Historical record for ${data.borrowerEmail}:`,
        data: {
          "Total past sessions": String(history.length),
          "Approve / Flag / Reject": `${counts.Approve} / ${counts.Flag} / ${counts.Reject}`,
          "Average D/E ratio": avgDE,
          "Last decision": `${last.decision} on ${lastDate}`,
        },
      })

      if (counts.Reject >= 2 || (counts.Flag + counts.Reject > counts.Approve && history.length >= 3)) {
        nudges.push(`⚠️ Repeat borrower with poor track record — ${counts.Reject} prior rejections and ${counts.Flag} flags across ${history.length} sessions.`)
      }
    }
  }

  // ── Step 1: Document ingestion ───────────────────────────────────────────────
  if (step === 1) {
    if (isHandwritten && isPoorScan) {
      nudges.push("⚠️ Handwritten ledger with poor scan quality — historical reject rate reaches 65% for this combination. Request electronic records before proceeding.")
      buttons.push({
        label: "View document request template",
        insight: "Standard template for requesting supplementary electronic records:",
        data: {
          "Subject": "Request for Electronic Financial Records",
          "Required documents": "Digital P&L, bank statements (6 months), tax returns (2 years)",
          "Acceptable formats": "PDF export from accounting software (QuickBooks, Xero, etc.)",
          "Deadline": "5 business days from receipt of this notice",
          "Note": "Manual OCR re-entry from poor scans has a ~30% transcription error rate",
        },
      })
    } else if (isHandwritten) {
      nudges.push("Handwritten ledger detected — flag for secondary verification. Manual ledgers have a 2× higher data entry error rate than digital documents.")
    } else if (isPoorScan) {
      nudges.push("Poor scan quality — transcription errors can inflate D/E ratios by 15–30%. Request a re-scan if financial figures are ambiguous.")
      buttons.push({
        label: "See scan quality impact on decisions",
        insight: "Historical data across 1,200 completed reviews:",
        data: {
          "Poor scan · Flag/Reject rate": "71%",
          "Good scan · Flag/Reject rate": "51%",
          "Relative uplift": "+39% more Flag/Reject for poor scans",
          "Root cause": "Transcription errors inflate D/E ratios",
          "Recommendation": "Request a re-scan or manual OCR verification",
        },
      })
    }

    if (data.documentType === "2022 Schedule K-1") {
      nudges.push("Schedule K-1 reflects partnership income only — request accompanying Form 1065 for full entity-level financials.")
    }

    if (hasLoan && !isNaN(income) && income > 0) {
      const lti = loanAmount / income
      if (lti > 10) {
        nudges.push(`⚠️ Loan-to-income ratio of ${lti.toFixed(1)}× — well above the 5× threshold. Repayment capacity is highly uncertain.`)
      } else if (lti > 5) {
        nudges.push(`Loan-to-income ratio of ${lti.toFixed(1)}× exceeds the 5× guideline. Verify income sources before proceeding.`)
      }
    }
  }

  // ── Step 2: Financial entry ──────────────────────────────────────────────────
  if (step === 2) {
    const hasDebt = !isNaN(debt) && debt > 0
    const hasEquity = !isNaN(equity) && equity > 0

    if (hasEquity && equity < 100_000) {
      nudges.push("⚠️ Equity below $100K — 89% of similar cases result in Reject. Escalate to senior underwriter.")
    }

    if (hasDebt && debt > 10_000_000) {
      nudges.push("⚠️ Debt exceeds $10M — mandatory escalation to credit committee per policy. Do not approve without committee sign-off.")
    } else if (hasDebt && debt > 5_000_000) {
      nudges.push("Large debt exposure (>$5M). Verify against current credit limits before proceeding.")
    }

    if (hasLoan && hasEquityVal && loanAmount > equity) {
      nudges.push(`⚠️ Loan amount ($${loanAmount.toLocaleString()}) exceeds total equity ($${equity.toLocaleString()}) — no collateral coverage. High loss-given-default.`)
    }

    if (postLoanDE !== null) {
      if (postLoanDE > 3) {
        nudges.push(`Post-loan D/E would reach ${postLoanDE.toFixed(2)} — above the 3.0 policy threshold. Rejection or executive approval required after disbursement.`)
      } else if (postLoanDE > 2) {
        nudges.push(`Post-loan D/E would reach ${postLoanDE.toFixed(2)} — elevated. Factor this into your risk assessment.`)
      }
    }

    if (hasDebt && hasEquity) {
      const r = debt / equity
      if (r > 5) {
        nudges.push(`⚠️ Preliminary D/E of ${r.toFixed(1)} — exceeds 5.0. Executive committee approval required; standard underwriter sign-off insufficient.`)
      } else if (r > 3) {
        nudges.push(`Preliminary D/E of ${r.toFixed(1)} — above policy threshold of 3.0. Prepare rejection rationale or obtain executive approval.`)
      } else if (r > 2) {
        nudges.push(`Preliminary D/E of ${r.toFixed(1)} — elevated. Likely to be flagged for review.`)
      }

      if (isHandwritten && r > 2) {
        nudges.push("Elevated D/E from handwritten source — verify figures against original documents before finalizing. Entry errors are common at this step.")
      }
    }
  }

  // ── Step 3: Ratio analysis ───────────────────────────────────────────────────
  if (step === 3 && ratio !== null) {
    if (ratio > 3 && isPoorScan) {
      nudges.push(`⚠️ D/E ratio ${ratio.toFixed(2)} with poor scan quality — ratio may be overstated due to transcription errors. Re-scan recommended before issuing a rejection.`)
    } else if (ratio > 3 && isHandwritten) {
      nudges.push(`⚠️ D/E ratio ${ratio.toFixed(2)} sourced from handwritten ledger — confirm all figures are correctly transcribed. A 10% input error at this D/E level changes the outcome.`)
      buttons.push({
        label: "See historical approval rate for this risk tier",
        insight: "Based on 1,200 completed reviews — D/E > 3.0 tier:",
        data: {
          "Approval rate": "4%",
          "Flag rate": "18%",
          "Reject rate": "78%",
          "Avg review time": "11 min (highest friction)",
          "Note": "Executive approval required per policy for D/E > 3.0",
        },
      })
    } else if (ratio > 3) {
      nudges.push(`D/E ratio ${ratio.toFixed(2)} exceeds 3.0 — policy threshold for rejection or executive approval.`)
      buttons.push({
        label: "See historical approval rate for this risk tier",
        insight: "Based on 1,200 completed reviews — D/E > 3.0 tier:",
        data: {
          "Approval rate": "4%",
          "Flag rate": "18%",
          "Reject rate": "78%",
          "Avg review time": "11 min (highest friction)",
          "Note": "Executive approval required per policy for D/E > 3.0",
        },
      })
    } else if (ratio > 2.5) {
      nudges.push(`D/E ratio ${ratio.toFixed(2)} above 2.5 — elevated risk. Recommend flagging for review.`)
      buttons.push({
        label: "See historical approval rate for this risk tier",
        insight: "Based on 1,200 completed reviews — D/E 2.5–3.0 tier:",
        data: {
          "Approval rate": "8%",
          "Flag rate": "37%",
          "Reject rate": "55%",
          "Avg review time": "9 min",
          "Note": "Secondary underwriter review recommended at this tier",
        },
      })
    } else if (ratio > 2) {
      nudges.push(`D/E ratio ${ratio.toFixed(2)} above 2.0 — elevated. Flag for review unless mitigating factors apply.`)
    } else if (ratio <= 1) {
      nudges.push(`Strong D/E ratio of ${ratio.toFixed(2)} — borrower shows healthy equity position. Standard approval path.`)
    } else {
      nudges.push(`D/E ratio ${ratio.toFixed(2)} — within acceptable range.`)
    }
  }

  // ── Step 4: Decision ─────────────────────────────────────────────────────────
  if (step === 4) {
    if (ratio !== null) {
      if (ratio > 3) {
        if (data.decision === "Approve") {
          nudges.push("⚠️ Approving a D/E ratio above 3.0 — senior underwriter sign-off and written justification required for compliance.")
        } else if (data.decision === "Flag") {
          nudges.push("D/E exceeds 3.0 — policy typically requires Reject or executive approval rather than Flag alone.")
        } else {
          nudges.push("System recommendation: Reject. D/E ratio exceeds policy threshold of 3.0.")
        }
      } else if (ratio > 2) {
        if (data.decision === "Approve") {
          nudges.push("Approving elevated D/E (>2.0) — document the mitigating factors in your notes for audit purposes.")
        } else {
          nudges.push("System recommendation: Flag for review. Elevated leverage warrants additional scrutiny.")
        }
      } else {
        if (data.decision !== "Approve") {
          nudges.push(`Rejecting or flagging a healthy D/E of ${ratio.toFixed(2)} — document the specific reason in notes.`)
        } else {
          nudges.push("System recommendation: Approve. Financials within acceptable parameters.")
        }
      }
    }

    if (data.decision === "Reject" && !data.decisionNotes) {
      nudges.push("⚠️ Rejection requires documented reasoning for compliance audit. Notes field is mandatory before submitting.")
    } else if (data.decision && !data.decisionNotes) {
      nudges.push("Consider adding notes to document your reasoning for audit purposes.")
    }
  }

  return Response.json({ nudges, buttons })
}
