import { useState } from "react";
import { signIn, signOut, useAuth } from "../lib/auth";

// Sign in with Google (allowlisted accounts act as admin on the API). Hidden
// until the API says sign-in is configured.
export default function AccountButton({ className = "" }: { className?: string }) {
  const { available, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!available) return null;
  const run = (f: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    // reload so every page's data is fetched again as the new identity
    f().then(() => window.location.reload()).catch((e) => {
      const code = (e as { code?: string }).code ?? "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") setErr(String((e as Error).message ?? e));
    }).finally(() => setBusy(false));
  };
  return (
    <span className={`text-xs flex items-center gap-2 ${className}`}>
      {session ? (
        <>
          <span className="text-muted truncate max-w-[14rem]" title="signed in with Google">{session.email}</span>
          <button disabled={busy} onClick={() => run(signOut)} className="text-muted hover:text-accent">sign out</button>
        </>
      ) : (
        <button disabled={busy} onClick={() => run(signIn)}
          className="border border-accent/50 text-accent rounded px-2 py-0.5 hover:bg-accent/10 disabled:opacity-40">
          {busy ? "signing in…" : "Sign in with Google"}
        </button>
      )}
      {err && <span className="text-red-400">{err}</span>}
    </span>
  );
}
