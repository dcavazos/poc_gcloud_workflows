import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const INACTIVITY_HOURS = 2;

async function closeInactiveConversations(request: NextRequest) {
  try {
    // Verify secret to prevent unauthorized calls
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - INACTIVITY_HOURS * 60 * 60 * 1000);

    // Find active conversations with lastMessageAt older than 2 hours
    const statuses = ["bot", "waiting_agent", "with_agent"];
    const conversationsRef = adminDb.collection("conversations");

    const snapshot = await conversationsRef
      .where("status", "in", statuses)
      .where("lastMessageAt", "<", cutoff)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ closed: 0, message: "No inactive conversations" });
    }

    const batch = adminDb.batch();
    const closedIds: string[] = [];

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "closed",
        assignedAgentId: null,
        assignedAt: null,
        closedAt: FieldValue.serverTimestamp(),
        closedReason: "inactivity",
      });
      closedIds.push(doc.id);
    });

    await batch.commit();

    console.log(`Closed ${closedIds.length} inactive conversations:`, closedIds);

    return NextResponse.json({
      closed: closedIds.length,
      conversationIds: closedIds,
    });
  } catch (error) {
    console.error("Error closing inactive conversations:", error);
    return NextResponse.json(
      { error: "Failed to close inactive conversations" },
      { status: 500 }
    );
  }
}

// GET: called by Vercel Cron
export async function GET(request: NextRequest) {
  return closeInactiveConversations(request);
}

// POST: called manually or from external cron services
export async function POST(request: NextRequest) {
  return closeInactiveConversations(request);
}
