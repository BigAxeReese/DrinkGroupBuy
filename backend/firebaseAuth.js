const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");

function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Firebase ID token is required");
  }

  return getFirebaseAuth().verifyIdToken(idToken);
}

function getFirebaseAuth() {
  if (getApps().length === 0) {
    initializeApp(getFirebaseAdminOptions());
  }

  return getAuth();
}

function getFirebaseAdminOptions() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountJson) {
    return {
      credential: cert(JSON.parse(serviceAccountJson)),
      projectId
    };
  }

  return {
    credential: applicationDefault(),
    projectId
  };
}

module.exports = {
  verifyFirebaseIdToken
};
