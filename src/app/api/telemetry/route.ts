import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const {
    covenantSessionId,
    eventType,
    step,
    fieldName,
    oldValue,
    newValue,
    timeOnStepMs,
    fieldChangeCount,
    metadata,
  } = await request.json()

  await db.telemetryEvent.create({
    data: {
      userId: session.user.id,
      covenantSessionId: covenantSessionId ?? null,
      eventType,
      step: step ?? null,
      fieldName: fieldName ?? null,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      timeOnStepMs: timeOnStepMs ?? null,
      fieldChangeCount: fieldChangeCount ?? null,
      metadata: metadata ?? null,
    },
  })

  return Response.json({ ok: true })
}
