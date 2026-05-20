import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import WorkflowClient from "./WorkflowClient"

export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  let covenantSession = await db.covenantSession.findFirst({
    where: { userId: session.user.id, status: "in_progress" },
    orderBy: { createdAt: "desc" },
  })

  if (!covenantSession) {
    covenantSession = await db.covenantSession.create({
      data: { userId: session.user.id },
    })
  }

  return (
    <WorkflowClient
      sessionId={covenantSession.id}
      initialStep={covenantSession.currentStep}
      initialData={{
        documentType: covenantSession.documentType ?? "",
        borrowerName: covenantSession.borrowerName ?? "",
        borrowerEmail: covenantSession.borrowerEmail ?? "",
        income: covenantSession.income?.toString() ?? "",
        loanAmount: covenantSession.loanAmount?.toString() ?? "",
        scanQuality: covenantSession.scanQuality ?? "",
        totalDebt: covenantSession.totalDebt?.toString() ?? "",
        totalEquity: covenantSession.totalEquity?.toString() ?? "",
        debtToEquityRatio: covenantSession.debtToEquityRatio,
        decision: covenantSession.decision ?? "",
        decisionNotes: covenantSession.decisionNotes ?? "",
      }}
    />
  )
}
