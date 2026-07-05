import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export function useFirebaseGoogleLogin() {
  const config = getAuthConfig();
  const redirectUri = getRedirectUri();
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: config.googleAndroidClientId,
    iosClientId: config.googleIosClientId,
    webClientId: config.googleWebClientId,
    redirectUri
  });

  async function signInWithGoogle() {
    assertFirebaseConfigured(config);
    const firebaseApp = getFirebaseApp(config.firebase);
    const auth = getAuth(firebaseApp);

    if (Platform.OS === "web") {
      const provider = new GoogleAuthProvider();
      const credentialResult = await signInWithPopup(auth, provider);
      return toFirebaseLoginResult(credentialResult);
    }

    const response = await promptAsync();
    if (response.type !== "success") {
      throw new Error("Google sign-in was cancelled");
    }

    const idToken = response.authentication?.idToken || response.params?.id_token;
    const accessToken = response.authentication?.accessToken || response.params?.access_token;
    if (!idToken) {
      throw new Error("Google sign-in did not return an ID token");
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    const credentialResult = await signInWithCredential(auth, credential);
    return toFirebaseLoginResult(credentialResult);
  }

  return {
    signInWithGoogle,
    redirectUri: Platform.OS === "web" ? null : request?.redirectUri || redirectUri
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
    googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra.googleAndroidClientId,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra.googleIosClientId,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId
  };
}

function getRedirectUri() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return undefined;
}

function assertFirebaseConfigured(config) {
  if (!hasFirebaseConfig(config.firebase)) {
    throw new Error("Firebase mobile config is missing");
  }
  if (!config.googleAndroidClientId && !config.googleWebClientId && !config.googleIosClientId) {
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
