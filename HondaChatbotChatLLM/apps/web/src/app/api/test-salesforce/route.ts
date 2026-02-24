import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-middleware";

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuthToken(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { instanceUrl, username, password } = await request.json();

    if (!instanceUrl || !username || !password) {
      return NextResponse.json(
        { error: "Faltan campos: instanceUrl, username, password" },
        { status: 400 }
      );
    }

    const tokenResponse = await fetch(`${instanceUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        username,
        password,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      const errorMsg = errorData.error_description || `HTTP ${tokenResponse.status}`;
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error testing Salesforce connection:", error);
    return NextResponse.json(
      { error: "Error de conexion" },
      { status: 500 }
    );
  }
}
