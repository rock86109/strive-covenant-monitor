import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import DashboardCharts, { type DashboardData } from "./DashboardCharts"

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const year = d.getUTCFullYear()
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, "0")}`
}

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const [decisionGroups, deStats, allSessions, stepTimeGroups, recentRaw] = await Promise.all([
    // Decision counts
    db.covenantSession.groupBy({
      by: ["decision"],
      where: { status: "completed", decision: { not: null } },
      _count: { id: true },
    }),

    // Avg D/E and total count
    db.covenantSession.aggregate({
      where: { status: "completed", debtToEquityRatio: { not: null } },
      _avg: { debtToEquityRatio: true },
      _count: { id: true },
    }),

    // All completed sessions for distribution + weekly trend
    db.covenantSession.findMany({
      where: { status: "completed", debtToEquityRatio: { not: null }, completedAt: { not: null } },
      select: { debtToEquityRatio: true, decision: true, completedAt: true },
    }),

    // Telemetry: avg step time per step
    db.telemetryEvent.groupBy({
      by: ["step"],
      where: { eventType: "step_exit", timeOnStepMs: { not: null }, step: { not: null } },
      _avg: { timeOnStepMs: true },
    }),

    // Recent sessions
    db.covenantSession.findMany({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        id: true,
        borrowerName: true,
        debtToEquityRatio: true,
        decision: true,
        completedAt: true,
        documentType: true,
      },
    }),
  ])

  // KPI: decision breakdown
  const decisionMap: Record<string, number> = {}
  for (const g of decisionGroups) {
    if (g.decision) decisionMap[g.decision] = g._count.id
  }
  const total = deStats._count.id
  const approveN = decisionMap["Approve"] ?? 0
  const flagN = decisionMap["Flag"] ?? 0
  const rejectN = decisionMap["Reject"] ?? 0
  const decisionTotal = approveN + flagN + rejectN

  // KPI: avg review time from telemetry step times
  const totalAvgMs = stepTimeGroups.reduce((sum, g) => sum + (g._avg.timeOnStepMs ?? 0), 0)
  const avgReviewMinutes = Math.round(totalAvgMs / 60000)

  // D/E Distribution buckets
  const BUCKETS = ["<0.5", "0.5–1", "1–1.5", "1.5–2", "2–2.5", "2.5–3", ">3"]
  type BucketRow = { bucket: string; Approve: number; Flag: number; Reject: number }
  const buckets: BucketRow[] = BUCKETS.map((b) => ({ bucket: b, Approve: 0, Flag: 0, Reject: 0 }))

  function bucketIndex(ratio: number): number {
    if (ratio < 0.5) return 0
    if (ratio < 1) return 1
    if (ratio < 1.5) return 2
    if (ratio < 2) return 3
    if (ratio < 2.5) return 4
    if (ratio < 3) return 5
    return 6
  }

  // Weekly volume: last 26 weeks
  const now = new Date()
  const weekMap: Record<string, number> = {}
  for (let w = 25; w >= 0; w--) {
    const d = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000)
    weekMap[isoWeek(d)] = 0
  }

  for (const s of allSessions) {
    const ratio = s.debtToEquityRatio!
    const decision = s.decision ?? "Reject"
    const idx = bucketIndex(ratio)
    if (decision === "Approve" || decision === "Flag" || decision === "Reject") {
      buckets[idx][decision]++
    }

    if (s.completedAt) {
      const wk = isoWeek(s.completedAt)
      if (wk in weekMap) weekMap[wk]++
    }
  }

  const weeklyVolume = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, sessions]) => ({ week: week.replace(/^\d{4}-/, ""), sessions }))

  const stepLabels: Record<number, string> = {
    1: "Step 1: Ingest",
    2: "Step 2: Validate",
    3: "Step 3: Analyze",
    4: "Step 4: Decide",
  }
  const stepTimes = stepTimeGroups
    .filter((g) => g.step != null && g._avg.timeOnStepMs != null)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
    .map((g) => ({
      step: stepLabels[g.step!] ?? `Step ${g.step}`,
      avgMinutes: Math.round(((g._avg.timeOnStepMs ?? 0) / 60000) * 10) / 10,
    }))

  const dashboardData: DashboardData = {
    kpis: {
      total,
      approvalRate: decisionTotal > 0 ? Math.round((approveN / decisionTotal) * 100) : 0,
      flagRate: decisionTotal > 0 ? Math.round((flagN / decisionTotal) * 100) : 0,
      rejectRate: decisionTotal > 0 ? Math.round((rejectN / decisionTotal) * 100) : 0,
      avgDE: Math.round((deStats._avg.debtToEquityRatio ?? 0) * 100) / 100,
      avgReviewMinutes,
    },
    deDistribution: buckets,
    weeklyVolume,
    stepTimes,
    recentSessions: recentRaw.map((s) => ({
      ...s,
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
  }

  return <DashboardCharts data={dashboardData} />
}
