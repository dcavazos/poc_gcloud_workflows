// Script para actualizar usuario con organizationId
// Ejecutar con: node scripts/update-user.js

const admin = require('firebase-admin');

// Inicializar Firebase Admin con credenciales por defecto
admin.initializeApp({
  projectId: 'atomic-hybrid-482121-n7'
});

const db = admin.firestore();

async function updateUser() {
  const email = 'david.cavazos@cleber.com';

  // Buscar usuario por email
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', email).limit(1).get();

  if (snapshot.empty) {
    console.log('Usuario no encontrado. ¿Ya te logueaste en la app?');
    return;
  }

  const userDoc = snapshot.docs[0];
  console.log('Usuario encontrado:', userDoc.id);
  console.log('Datos actuales:', userDoc.data());

  // Actualizar
  await userDoc.ref.update({
    organizationId: 'org_honda_cleber',
    role: 'admin'
  });

  console.log('\n✓ Usuario actualizado con organizationId: org_honda_cleber y role: admin');
}

updateUser().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
