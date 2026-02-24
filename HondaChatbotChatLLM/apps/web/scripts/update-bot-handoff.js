const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase Admin
const app = initializeApp({
  projectId: "atomic-hybrid-482121-n7",
});

const db = getFirestore(app);

async function updateBotHandoff() {
  try {
    // Get all bots
    const botsSnapshot = await db.collection("bots").get();

    if (botsSnapshot.empty) {
      console.log("No bots found in Firestore");
      return;
    }

    console.log(`Found ${botsSnapshot.size} bot(s)`);

    for (const doc of botsSnapshot.docs) {
      const botData = doc.data();
      console.log(`\nBot: ${doc.id}`);
      console.log(`  Name: ${botData.name}`);
      console.log(`  Current handoffConfig:`, botData.handoffConfig || "none");

      // Update handoff config
      await db.collection("bots").doc(doc.id).update({
        handoffConfig: {
          enabled: true,
          triggerKeywords: [
            "agente",
            "asesor",
            "hablar con alguien",
            "persona real",
            "humano",
            "representante",
            "ejecutivo",
            "ayuda humana",
            "quiero hablar con",
            "necesito hablar con"
          ],
          autoAssign: true,
          waitingMessage: "Entendido, te comunico con un asesor. En un momento te atenderán."
        }
      });

      console.log(`  ✓ handoffConfig updated!`);
    }

    console.log("\nDone!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

updateBotHandoff();
