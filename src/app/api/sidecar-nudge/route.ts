type InsightButton = {
  label: string
  insight: string
  data: Record<string, string>
}

export async function POST(request: Request) {
  const { step, data } = await request.json()
  const nudges: string[] = []
  const buttons: InsightButton[] = []

  if (step === 1) {
    if (data.scanQuality === "Poor") {
      nudges.push("Low quality scan — consider requesting a cleaner copy before proceeding.")
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
    if (data.documentType === "Handwritten Ledger") {
      nudges.push("Handwritten ledgers require manual verification. Flag for secondary review.")
    }
  }

  if (step === 2) {
    const debt = parseFloat(data.totalDebt)
    const equity = parseFloat(data.totalEquity)
    if (!isNaN(equity) && equity > 0 && equity < 100_000) {
      nudges.push("Very low equity position (<$100K). Consider escalating to senior underwriter.")
    }
    if (!isNaN(debt) && debt > 5_000_000) {
      nudges.push("Large debt exposure (>$5M). Verify against current credit limits.")
    }
    if (!isNaN(debt) && !isNaN(equity) && equity > 0) {
      const r = debt / equity
      if (r > 2) {
        nudges.push(`Preliminary D/E ratio: ${r.toFixed(2)} — elevated. Prepare to flag.`)
      }
    }
  }

  if (step === 3) {
    const ratio: unknown = data.debtToEquityRatio
    if (typeof ratio === "number") {
      if (ratio > 3) {
        nudges.push(
          `D/E ratio ${ratio.toFixed(2)} exceeds 3.0 — policy threshold for rejection or executive approval.`,
        )
        buttons.push({
          label: "See historical approval rate for this risk tier",
          insight: "Based on 1,200 completed reviews — D/E > 3.0 tier:",
          data: {
            "Approval rate": "4%",
            "Flag rate": "18%",
            "Reject rate": "78%",
            "Avg review time": "11 min (highest friction step)",
            "Note": "Executive approval required per policy for D/E > 3.0",
          },
        })
      } else if (ratio > 2.5) {
        nudges.push(`D/E ratio ${ratio.toFixed(2)} above 2.5 — elevated risk. Recommend flagging.`)
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
        nudges.push(`D/E ratio ${ratio.toFixed(2)} above 2.0 — elevated risk. Recommend flagging.`)
      } else if (ratio <= 1) {
        nudges.push(`Strong D/E ratio of ${ratio.toFixed(2)}. Borrower shows healthy equity position.`)
      } else {
        nudges.push(`D/E ratio ${ratio.toFixed(2)} — within acceptable range.`)
      }
    }
  }

  if (step === 4) {
    const ratio: unknown = data.debtToEquityRatio
    if (typeof ratio === "number") {
      if (ratio > 3) {
        nudges.push("System recommendation: Reject. D/E ratio exceeds policy threshold of 3.0.")
      } else if (ratio > 2) {
        nudges.push(
          "System recommendation: Flag for review. Elevated leverage warrants additional scrutiny.",
        )
      } else {
        nudges.push("System recommendation: Approve. Financials within acceptable parameters.")
      }
    }
    if (data.decision && !data.decisionNotes) {
      nudges.push("Consider adding notes to document your reasoning for audit purposes.")
    }
  }

  return Response.json({ nudges, buttons })
}
