import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const DOCUMENT_TYPES = ["Tax Return", "Financial Statement", "Bank Statement", "Handwritten Ledger"]

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Log-normal distribution to model realistic debt/equity figures
function logNormal(mean: number, sigma: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.exp(mean + sigma * z)
}

function decisionForRatio(ratio: number, scanQuality: string): string {
  const r = Math.random()
  // Base approve/flag thresholds by D/E tier
  let [a, f] =
    ratio <= 1.5 ? [0.82, 0.94] :
    ratio <= 2.5 ? [0.28, 0.75] :
    ratio <= 3.0 ? [0.08, 0.45] :
                   [0.04, 0.22]

  // Poor scan quality causes transcription errors → ~40% more Flag/Reject outcomes
  if (scanQuality === "Poor") {
    a = Math.max(0, a - 0.08)
    f = Math.max(a, f - 0.04)
  }

  return r < a ? "Approve" : r < f ? "Flag" : "Reject"
}

const APPROVE_NOTES = [
  "Financials verified. Healthy equity base. Recommend approval.",
  "All covenants met. Strong balance sheet.",
  "D/E ratio within acceptable range. No issues found.",
  "Clean tax returns. Consistent income over 3 years.",
  "Approved. Borrower has strong equity position.",
]
const FLAG_NOTES = [
  "Elevated leverage. Refer to senior underwriter.",
  "Preliminary financials appear inconsistent. Needs secondary review.",
  "D/E ratio above threshold. Flagging for compliance team.",
  "Handwritten ledger — manual verification required.",
  "Income figures inconsistent with stated assets.",
]
const REJECT_NOTES = [
  "D/E ratio exceeds policy limit. Cannot proceed.",
  "Insufficient equity to cover debt obligations.",
  "Multiple red flags in submitted documents.",
  "Executive approval required — not obtained within SLA.",
  "Borrower failed to provide complete documentation.",
]

function notesForDecision(decision: string): string {
  if (decision === "Approve") return pick(APPROVE_NOTES)
  if (decision === "Flag") return pick(FLAG_NOTES)
  return pick(REJECT_NOTES)
}

async function main() {
  // Upsert seed user
  const seedUser = await db.user.upsert({
    where: { email: "seed@covenant-monitor.internal" },
    update: {},
    create: {
      email: "seed@covenant-monitor.internal",
      name: "Seed Data",
      emailVerified: new Date(),
    },
  })

  const existingCount = await db.covenantSession.count({
    where: { userId: seedUser.id },
  })

  if (existingCount >= 1000) {
    console.log(`Seed already complete (${existingCount} sessions). Skipping.`)
    return
  }

  const toCreate = 1200 - existingCount
  console.log(`Creating ${toCreate} sessions…`)

  const now = Date.now()
  const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000

  for (let i = 0; i < toCreate; i++) {
    const letter = String.fromCharCode(65 + (i % 26))
    const borrowerName = letter
    const borrowerEmail = `${letter.toLowerCase()}@gmail.com`

    const docType = Math.random() < 0.4 ? "Tax Return" : Math.random() < 0.6 ? "Financial Statement" : Math.random() < 0.75 ? "Bank Statement" : "Handwritten Ledger"
    const scanQuality = Math.random() < 0.8 ? "Good" : "Poor"

    // Equity: log-normal centered around $800K
    const totalEquity = Math.round(logNormal(13.5, 0.9) * 100) / 100
    // Debt: log-normal, loosely correlated with equity but with spread
    const targetRatio = logNormal(0.5, 0.7) // D/E target, median ~1.65
    const totalDebt = Math.round(totalEquity * targetRatio * 100) / 100
    const debtToEquityRatio = Math.round((totalDebt / totalEquity) * 100) / 100
    const income = Math.round(rand(50000, 1200000) * 100) / 100

    const decision = decisionForRatio(debtToEquityRatio, scanQuality)
    const decisionNotes = notesForDecision(decision)

    const createdAt = new Date(sixMonthsAgo + Math.random() * (now - sixMonthsAgo))
    const reviewMs = Math.round(rand(90_000, 900_000)) // 1.5 to 15 min total
    const completedAt = new Date(createdAt.getTime() + reviewMs)

    const session = await db.covenantSession.create({
      data: {
        userId: seedUser.id,
        documentType: docType,
        borrowerName,
        borrowerEmail,
        income,
        scanQuality,
        totalDebt,
        totalEquity,
        debtToEquityRatio,
        decision,
        decisionNotes,
        currentStep: 4,
        status: "completed",
        createdAt,
        updatedAt: completedAt,
        completedAt,
      },
    })

    // Telemetry: step enter/exit events with realistic times
    const stepMs = [
      Math.round(rand(15_000, 180_000)), // step 1
      Math.round(rand(10_000, 120_000)), // step 2
      Math.round(rand(5_000, 60_000)),   // step 3
      Math.round(rand(20_000, 180_000)), // step 4
    ]

    let t = createdAt.getTime()
    for (let step = 1; step <= 4; step++) {
      await db.telemetryEvent.create({
        data: {
          userId: seedUser.id,
          covenantSessionId: session.id,
          eventType: "step_enter",
          step,
          createdAt: new Date(t),
        },
      })
      t += stepMs[step - 1]
      await db.telemetryEvent.create({
        data: {
          userId: seedUser.id,
          covenantSessionId: session.id,
          eventType: "step_exit",
          step,
          timeOnStepMs: stepMs[step - 1],
          fieldChangeCount: Math.floor(rand(1, 8)),
          createdAt: new Date(t),
        },
      })
    }

    await db.telemetryEvent.create({
      data: {
        userId: seedUser.id,
        covenantSessionId: session.id,
        eventType: "decision_made",
        step: 4,
        newValue: decision,
        createdAt: new Date(t),
      },
    })

    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${toCreate}`)
  }

  console.log("Seed complete.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
