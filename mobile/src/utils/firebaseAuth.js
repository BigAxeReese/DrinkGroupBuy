import { useEffect } from "react";
import Constants from "expo-constants";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import { Platform } from "react-native";

export function useFirebaseGoogleLogin() {
  const config = getAuthConfig();

  // Android goes through the official native Google Sign-In SDK (Google Play Services) --
  // Google no longer accepts a custom URL-scheme redirect for "Android" type OAuth clients at
  // all (any app could historically claim the same scheme and intercept the callback, so Google
  // closed that off), so a generic browser-redirect flow (what this project used before, via
  // expo-auth-session) can't work here regardless of the exact redirect URI used. webClientId is
  // what Firebase needs as the ID token's audience; the Android OAuth client registered in
  // Google Cloud Console is only used implicitly by Play Services, verified against the app's
  // own package name + signing certificate -- its client ID string is never read anywhere in
  // this file.
  useEffect(() => {
    if (Platform.OS !== "android" || !config.googleWebClientId) return;
    GoogleSignin.configure({ webClientId: config.googleWebClientId });
  }, [config.googleWebClientId]);

  async function signInWithGoogle() {
    assertFirebaseConfigured(config);
    const firebaseApp = getFirebaseApp(config.firebase);
    const auth = getAuth(firebaseApp);

    if (Platform.OS === "web") {
      const provider = new GoogleAuthProvider();
      try {
        const credentialResult = await signInWithPopup(auth, provider);
        return toFirebaseLoginResult(credentialResult);
      } catch (error) {
        // Closing the account-picker popup is a deliberate, ordinary choice, not a failure --
        // normalize it to the same `.code` the Android branch below uses so the caller (see
        // RoleSelectScreen.jsx) can treat "the person changed their mind" the same way on both
        // platforms, without needing to know either one's provider-specific error shape.
        if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") {
          throw Object.assign(new Error("Google sign-in was cancelled"), { code: "cancelled" });
        }
        throw error;
      }
    }

    // iOS is not in this project's supported platform scope (see AGENTS.md; app.config.js's
    // `platforms` only lists android/web) -- only Android's native flow is implemented below.
    if (Platform.OS !== "android") {
      throw new Error(`Google sign-in is not supported on this platform: ${Platform.OS}`);
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      // The person backed out of the account picker -- a deliberate, ordinary choice, not a
      // failure. `.code` lets the caller skip showing an error for this specific case.
      throw Object.assign(new Error("Google sign-in was cancelled"), { code: "cancelled" });
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error("Google sign-in did not return an ID token");
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const credentialResult = await signInWithCredential(auth, credential);
    return toFirebaseLoginResult(credentialResult);
  }

  return {
    signInWithGoogle,
    redirectUri: null
  };
}

export async function signOutFirebaseUser() {
  const config = getAuthConfig();
  if (!hasFirebaseConfig(config.firebase) || getApps().length === 0) return;
  await signOut(getAuth(getFirebaseApp(config.firebase)));
}

function getFirebaseApp(firebaseConfig) {
  return getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
}

async function toFirebaseLoginResult(credentialResult) {
  const firebaseIdToken = await credentialResult.user.getIdToken(true);

  return {
    firebaseIdToken,
    firebaseUser: {
      uid: credentialResult.user.uid,
      email: credentialResult.user.email,
      displayName: credentialResult.user.displayName
    }
  };
}

function getAuthConfig() {
  const extra = Constants.expoConfig?.extra
    || Constants.manifest2?.extra?.expoClient?.extra
    || {};

  return {
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || extra.firebaseApiKey,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extra.firebaseAuthDomain,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extra.firebaseProjectId,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || extra.firebaseAppId
    },
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId
  };
}

function assertFirebaseConfigured(config) {
  if (!hasFirebaseConfig(config.firebase)) {
    throw new Error("Firebase mobile config is missing");
  }
  if (!config.googleWebClientId) {
    throw new Error("Google OAuth client ID is missing");
  }
}

function hasFirebaseConfig(firebaseConfig) {
  return Boolean(
    firebaseConfig.apiKey
    && firebaseConfig.authDomain
    && firebaseConfig.projectId
    && firebaseConfig.appId
  );
}
