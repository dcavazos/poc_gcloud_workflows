import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuthToken } from "@/lib/auth-middleware";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuthToken(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, role } = await request.json();

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email and role are required" },
        { status: 400 }
      );
    }

    if (!["admin", "agent", "viewer"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'admin', 'agent', or 'viewer'" },
        { status: 400 }
      );
    }

    // Verify the caller is an admin
    const callerDoc = await adminDb.collection("users").doc(authUser.uid).get();
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const callerData = callerDoc.data();
    if (callerData?.role !== "admin" || !callerData?.organizationId) {
      return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });
    }

    const organizationId = callerData.organizationId;

    // Check if a user with this email already exists in the org
    const existingUsers = await adminDb
      .collection("users")
      .where("email", "==", email)
      .where("organizationId", "==", organizationId)
      .get();

    if (!existingUsers.empty) {
      return NextResponse.json(
        { error: "Ya existe un usuario con este email en la organización" },
        { status: 409 }
      );
    }

    // Create the pre-registered user document
    const now = new Date();
    const newUserRef = adminDb.collection("users").doc();
    const newUserData = {
      id: newUserRef.id,
      email,
      name: "",
      role,
      organizationId,
      status: "offline",
      photoURL: null,
      createdAt: now,
      lastLoginAt: null,
      invitedBy: authUser.uid,
    };

    await newUserRef.set(newUserData);

    // Send invite email via Resend
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app";

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "noreply@resend.dev",
        to: email,
        subject: "Invitación a la plataforma de Chatbot",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Has sido invitado a la plataforma</h2>
            <p>Un administrador te ha invitado a unirte al equipo como <strong>${role === "agent" ? "Agente" : "Observador"}</strong>.</p>
            <p>Haz clic en el siguiente enlace para acceder:</p>
            <a href="${appUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
              Acceder a la plataforma
            </a>
            <p style="color: #666; font-size: 14px;">Inicia sesión con tu cuenta de Google asociada a <strong>${email}</strong>.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Error sending invite email:", emailError);
      // Don't fail the whole request if email fails — user doc was already created
    }

    return NextResponse.json({ success: true, user: newUserData });
  } catch (error) {
    console.error("Error creating invite:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}
