// Sign in with Google through Firebase Authentication, the same project and
// setup as the market tracker's site, so the site works on a new device
// (a phone) without pasting the API token. The Firebase web config comes from the API
// (GET /v1/auth/config), so the build needs no config, and the SDK is only
// loaded when sign-in is configured. Firebase keeps the user signed in across
// reloads and refreshes the ID token itself; the API verifies that token and
// checks the email against its allowlist.

import { useEffect, useState } from "react";
import type { Auth, User } from "firebase/auth";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8084";

export interface Session {
  email: string;
}

interface AuthConfig {
  firebase: Record<string, string> | null;
  firebase_enabled: boolean;
}

let authPromise: Promise<Auth | null> | null = null;
let user: User | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Firebase Auth, or null when sign-in isn't configured on the API.
function firebaseAuth(): Promise<Auth | null> {
  authPromise ??= (async () => {
    let cfg: AuthConfig;
    try {
      const r = await fetch(`${BASE}/v1/auth/config`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      cfg = await r.json();
    } catch {
      // The API didn't answer (a blip or a redeploy): don't remember "no
      // sign-in" for the whole visit; the next call asks again.
      authPromise = null;
      return null;
    }
    if (!cfg.firebase_enabled || !cfg.firebase) return null;
    const [{ initializeApp }, { getAuth, onAuthStateChanged }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const auth = getAuth(initializeApp(cfg.firebase));
    onAuthStateChanged(auth, (u) => {
      user = u;
      notify();
    });
    return auth;
  })();
  return authPromise;
}

// True after the last config check failed to reach the API (vs the API
// saying sign-in isn't configured).
export function authUnreachable(): boolean {
  return authPromise == null;
}

export function currentSession(): Session | null {
  return user?.email ? { email: user.email } : null;
}

// The signed-in person's ID token (null when signed out or sign-in isn't
// configured). Firebase refreshes it when it's near expiry.
export async function idToken(): Promise<string | null> {
  await firebaseAuth();
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

// Firebase restores a saved sign-in shortly after start; wait for that
// first answer so the first requests carry it.
let ready: Promise<void> | null = null;
export function authReady(): Promise<void> {
  ready ??= (async () => {
    const auth = await firebaseAuth();
    if (auth && "authStateReady" in auth) await (auth as Auth & { authStateReady: () => Promise<void> }).authStateReady();
  })();
  return ready;
}

export async function signIn(): Promise<void> {
  const auth = await firebaseAuth();
  if (!auth) throw new Error("Sign-in isn't configured on the API");
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export async function signOut(): Promise<void> {
  const auth = await firebaseAuth();
  if (!auth) return;
  const { signOut: fbSignOut } = await import("firebase/auth");
  await fbSignOut(auth);
}

// Whether sign-in is available (null while loading), and the current session.
export function useAuth(): { available: boolean | null; session: Session | null } {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [session, setSession] = useState(currentSession);
  useEffect(() => {
    const l = () => setSession(currentSession());
    listeners.add(l);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => firebaseAuth().then((a) => {
      setAvailable(a != null);
      l();
      // Not answered yet: try again a few times (5 s, 10 s, 20 s...).
      if (a == null && authPromise == null && tries < 6) timer = setTimeout(check, 5000 * 2 ** tries++);
    });
    check();
    return () => {
      listeners.delete(l);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return { available, session };
}

export function useSession(): Session | null {
  return useAuth().session;
}
