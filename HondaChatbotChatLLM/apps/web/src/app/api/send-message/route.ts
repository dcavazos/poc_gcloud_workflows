import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthToken } from "@/lib/auth-middleware";

export async function POST(request: NextRequest) {
  try {
    const authUser = await verifyAuthToken(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, text, agentId } = body;

    // Validate required fields
    if (!conversationId || !text || !agentId) {
      return NextResponse.json(
        { error: "Missing required fields: conversationId, text, agentId" },
        { status: 400 }
      );
    }

    // Get conversation to find customer phone and botId
    const conversationRef = adminDb.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversation = conversationDoc.data();
    const customerPhone = conversation?.customerPhone;
    const botId = conversation?.botId;
    const whatsappNumberId = conversation?.whatsappNumberId;

    if (!customerPhone) {
      return NextResponse.json(
        { error: "Customer phone not found in conversation" },
        { status: 400 }
      );
    }

    if (!botId) {
      return NextResponse.json(
        { error: "Bot ID not found in conversation" },
        { status: 400 }
      );
    }

    // Determine provider from whatsappNumber doc
    let provider = "twilio";
    let valuetextSenderId = "";
    let waNumberOrgId = "";

    if (whatsappNumberId) {
      const waNumberDoc = await adminDb.collection("whatsappNumbers").doc(whatsappNumberId).get();
      if (waNumberDoc.exists) {
        const waData = waNumberDoc.data();
        provider = waData?.provider || "twilio";
        valuetextSenderId = waData?.valuetextSenderId || "";
        waNumberOrgId = waData?.organizationId || "";
      }
    }

    if (provider === "valuetext") {
      // Send via Salesforce REST API (insert SMS_Bucket__c for ValueText)
      if (!waNumberOrgId) {
        return NextResponse.json(
          { error: "Organization ID not found for WhatsApp number" },
          { status: 500 }
        );
      }

      const orgDoc = await adminDb.collection("organizations").doc(waNumberOrgId).get();
      const sfConfig = orgDoc.data()?.salesforceConfig;

      if (!sfConfig?.instanceUrl || !sfConfig?.clientId || !sfConfig?.clientSecret || !sfConfig?.username || !sfConfig?.password) {
        return NextResponse.json(
          { error: "Salesforce credentials not configured for organization" },
          { status: 500 }
        );
      }

      // 1. Get access token via username-password flow
      const tokenResponse = await fetch(`${sfConfig.instanceUrl}/services/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: sfConfig.clientId,
          client_secret: sfConfig.clientSecret,
          username: sfConfig.username,
          password: sfConfig.password,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Salesforce token error:", tokenResponse.status, errorText);
        return NextResponse.json(
          { error: `Salesforce auth error: ${tokenResponse.status}` },
          { status: 500 }
        );
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // 2. Insert SMS_Bucket__c record
      const mobileNumber = customerPhone.replace("whatsapp:", "");

      const sfResponse = await fetch(
        `${sfConfig.instanceUrl}/services/data/v59.0/sobjects/rsplus__SMS_Bucket__c/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rsplus__Number__c: mobileNumber,
            rsplus__Message__c: text,
            rsplus__Sender_ID__c: valuetextSenderId,
          }),
        }
      );

      if (!sfResponse.ok) {
        const errorText = await sfResponse.text();
        console.error("Salesforce insert error:", sfResponse.status, errorText);
        return NextResponse.json(
          { error: `Salesforce API error: ${sfResponse.status}` },
          { status: 500 }
        );
      }
    } else {
      // Send via Twilio (existing flow)
      const botDoc = await adminDb.collection("bots").doc(botId).get();

      if (!botDoc.exists) {
        return NextResponse.json(
          { error: "Bot not found" },
          { status: 404 }
        );
      }

      const botData = botDoc.data();

      // Get Twilio credentials: prefer whatsappNumber-level, fallback to bot-level
      let accountSid = "";
      let authToken = "";
      let fromNumber = "";

      if (whatsappNumberId) {
        const waNumberDoc = await adminDb.collection("whatsappNumbers").doc(whatsappNumberId).get();
        if (waNumberDoc.exists) {
          const waData = waNumberDoc.data();
          accountSid = waData?.twilioAccountSid || "";
          authToken = waData?.twilioAuthToken || "";
          fromNumber = waData?.phoneNumber || "";
        }
      }

      // Fallback to bot's twilioConfig
      if (!accountSid || !authToken) {
        const twilioConfig = botData?.twilioConfig;
        accountSid = twilioConfig?.accountSid || "";
        authToken = twilioConfig?.authToken || "";
        fromNumber = fromNumber || twilioConfig?.phoneNumber || "";
      }

      if (!accountSid || !authToken || !fromNumber) {
        return NextResponse.json(
          { error: "Twilio configuration incomplete" },
          { status: 500 }
        );
      }

      const client = twilio(accountSid, authToken);

      await client.messages.create({
        body: text,
        from: fromNumber,
        to: customerPhone,
      });
    }

    // Save message to Firestore
    const messagesRef = conversationRef.collection("messages");
    const messageDoc = await messagesRef.add({
      conversationId,
      sender: "agent",
      agentId,
      text,
      mediaUrl: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Update conversation lastMessageAt
    await conversationRef.update({
      lastMessageAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      messageId: messageDoc.id,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
