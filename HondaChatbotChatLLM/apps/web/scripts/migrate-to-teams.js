/**
 * Migration script: Add Teams and WhatsAppNumbers collections
 *
 * This script:
 * 1. Creates a default Team for each organization
 * 2. Migrates Bot's Twilio config to WhatsAppNumbers collection
 * 3. Updates Bots with teamId
 * 4. Updates Users with teamId
 * 5. Updates Conversations with new fields
 *
 * Run with: node scripts/migrate-to-teams.js
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Initialize Firebase Admin
const app = initializeApp({
  projectId: "atomic-hybrid-482121-n7",
});

const db = getFirestore(app);

async function migrate() {
  console.log("Starting migration to Teams model...\n");

  try {
    // 1. Get all organizations (from users)
    console.log("1. Finding organizations...");
    const usersSnapshot = await db.collection("users").get();
    const orgIds = new Set();
    usersSnapshot.forEach(doc => {
      const orgId = doc.data().organizationId;
      if (orgId) orgIds.add(orgId);
    });
    console.log(`   Found ${orgIds.size} organization(s)\n`);

    // 2. Create default team for each organization
    console.log("2. Creating default teams...");
    const teamsByOrg = {};

    for (const orgId of orgIds) {
      // Check if team already exists
      const existingTeams = await db.collection("teams")
        .where("organizationId", "==", orgId)
        .limit(1)
        .get();

      if (!existingTeams.empty) {
        const team = existingTeams.docs[0];
        teamsByOrg[orgId] = team.id;
        console.log(`   Team already exists for org ${orgId}: ${team.id}`);
        continue;
      }

      // Create new team
      const teamRef = db.collection("teams").doc();
      const teamData = {
        id: teamRef.id,
        organizationId: orgId,
        name: "Equipo Principal",
        description: "Equipo por defecto",
        assignmentMode: "least_busy",
        maxConversationsPerAgent: 10,
        activeConversations: 0,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      };
      await teamRef.set(teamData);
      teamsByOrg[orgId] = teamRef.id;
      console.log(`   Created team ${teamRef.id} for org ${orgId}`);
    }
    console.log("");

    // 3. Migrate Bots -> WhatsAppNumbers and update Bots
    console.log("3. Migrating Bots to WhatsAppNumbers...");
    const botsSnapshot = await db.collection("bots").get();

    for (const botDoc of botsSnapshot.docs) {
      const bot = botDoc.data();
      const orgId = bot.organizationId;
      const teamId = teamsByOrg[orgId];

      if (!teamId) {
        console.log(`   Skipping bot ${botDoc.id} - no team found for org ${orgId}`);
        continue;
      }

      const twilioConfig = bot.twilioConfig || {};
      const phoneNumber = twilioConfig.phoneNumber;

      if (!phoneNumber) {
        console.log(`   Skipping bot ${botDoc.id} - no phone number`);
        continue;
      }

      // Check if WhatsAppNumber already exists
      const existingNumbers = await db.collection("whatsappNumbers")
        .where("phoneNumber", "==", phoneNumber)
        .limit(1)
        .get();

      let whatsappNumberId;

      if (!existingNumbers.empty) {
        whatsappNumberId = existingNumbers.docs[0].id;
        console.log(`   WhatsApp number already exists: ${whatsappNumberId}`);
      } else {
        // Create WhatsAppNumber
        const numberRef = db.collection("whatsappNumbers").doc();
        const numberData = {
          id: numberRef.id,
          organizationId: orgId,
          teamId: teamId,
          phoneNumber: phoneNumber,
          displayName: bot.name || "WhatsApp",
          twilioAccountSid: twilioConfig.accountSid || "",
          twilioAuthToken: twilioConfig.authToken || "",
          defaultBotId: botDoc.id,
          status: "active",
          createdAt: FieldValue.serverTimestamp(),
        };
        await numberRef.set(numberData);
        whatsappNumberId = numberRef.id;
        console.log(`   Created WhatsApp number ${numberRef.id} for ${phoneNumber}`);
      }

      // Update Bot with teamId (keep twilioConfig for backward compatibility during transition)
      await db.collection("bots").doc(botDoc.id).update({
        teamId: teamId,
        whatsappNumberId: whatsappNumberId,
      });
      console.log(`   Updated bot ${botDoc.id} with teamId ${teamId}`);
    }
    console.log("");

    // 4. Update Users with teamId
    console.log("4. Updating Users with teamId...");
    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data();
      const orgId = user.organizationId;
      const teamId = teamsByOrg[orgId];

      if (!teamId) continue;

      // Only update if user doesn't have teamId
      if (!user.teamId) {
        await db.collection("users").doc(userDoc.id).update({
          teamId: teamId,
        });
        console.log(`   Updated user ${userDoc.id} with teamId ${teamId}`);
      }
    }
    console.log("");

    // 5. Update Conversations with new fields
    console.log("5. Updating Conversations...");
    const conversationsSnapshot = await db.collection("conversations").get();

    for (const convDoc of conversationsSnapshot.docs) {
      const conv = convDoc.data();
      const updates = {};

      // Get bot to find teamId and whatsappNumberId
      if (conv.botId) {
        const botDoc = await db.collection("bots").doc(conv.botId).get();
        if (botDoc.exists) {
          const bot = botDoc.data();
          if (bot.teamId && !conv.teamId) {
            updates.teamId = bot.teamId;
          }
          if (bot.whatsappNumberId && !conv.whatsappNumberId) {
            updates.whatsappNumberId = bot.whatsappNumberId;
          }
        }
      }

      // Set agent type based on status
      if (!conv.assignedAgentType) {
        if (conv.status === "bot") {
          updates.assignedAgentType = "bot";
          updates.assignedBotId = conv.botId || null;
          updates.assignedUserId = null;
        } else if (conv.status === "with_agent" && conv.assignedAgentId) {
          updates.assignedAgentType = "human";
          updates.assignedBotId = null;
          updates.assignedUserId = conv.assignedAgentId;
        } else {
          updates.assignedAgentType = null;
          updates.assignedBotId = null;
          updates.assignedUserId = null;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.collection("conversations").doc(convDoc.id).update(updates);
        console.log(`   Updated conversation ${convDoc.id}`);
      }
    }
    console.log("");

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
