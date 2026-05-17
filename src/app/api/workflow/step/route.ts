import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { sessionId, data } = await request.json()

  const existing = await db.covenantSession.findFirst({
    where: { id: sessionId, userId: session.user.id },
  })
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 })

  const updated = await db.covenantSession.update({
    where: { id: sessionId },
    data,
  })

  return Response.json({ session: updated })
}
