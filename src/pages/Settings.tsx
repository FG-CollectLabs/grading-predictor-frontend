import { useEffect, useMemo, useState } from "react";
import { api, checkToken, cleanToken, getToken, setToken } from "../api";
import AccountButton from "../components/AccountButton";
import { useAuth } from "../lib/auth";
import type { Setting, SettingValue } from "../types";

// Operating settings (backend internal/predictor/settings.go): AI job sizes,
// the per-card cap, photo storage limits, housekeeping. Edits take effect on
// the next run of whatever reads them (AI jobs hourly, workers within a
// minute, the API within 30 s). Saving needs the admin token.

type Draft = Record<string, SettingValue | null>; // null = back to default
const same = (a: SettingValue | null, b: SettingValue | null) => JSON.stringify(a) === JSON.stringify(b);

const GROUP_NOTE: Record<string, string> = {
  "AI jobs": "Hourly jobs on agent2 (tools/cert_reader.py). One AI look answers card, grade and cert together. Read at the start of each run.",
  Dataset: "Which listings become copies we process.",
  "Photo storage": "Read by the photo triage worker and the daily cleanup.",
};

export default function Settings() {
  const [items, setItems] = useState<Setting[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSettings().then((r) => setItems(r.settings)).catch((e: unknown) => setErr(String(e)));
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, Setting[]>();
    for (const s of items ?? []) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()];
  }, [items]);

  const invalid = (s: Setting, v: SettingValue | null) =>
    v === null || s.kind === "bool" ? null
      : s.kind === "ids" ? (Array.isArray(v) && v.every((x) => Number.isInteger(x) && x > 0) && v.length <= s.max ? null : `card ids (up to ${s.max})`)
      : Number.isNaN(v as number) ? "a number"
      : (v as number) < s.min || (v as number) > s.max ? `${s.min}–${s.max}`
      : s.kind === "int" && !Number.isInteger(v) ? "a whole number" : null;
  const dirty = Object.keys(draft);
  const bad = items?.some((s) => s.key in draft && invalid(s, draft[s.key])) ?? false;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.saveSettings(draft);
      setItems(r.settings);
      setDraft({});
      setSaved(`Saved ${dirty.length} setting${dirty.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !items) return <div className="text-red-400 text-xs">{err}</div>;
  if (!items) return <div className="text-muted text-xs">loading…</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <TokenBox />
        <p className="text-muted text-xs mt-1">
          Operating knobs that used to be env vars and cron flags. A setting left at its default follows the env var
          (shown as the default). Changes apply on the next run of whatever reads them.
        </p>
      </div>

      {groups.map(([group, list]) => (
        <section key={group} className="bg-surface border border-border rounded-md p-4">
          <h2 className="text-sm font-semibold">{group}</h2>
          {GROUP_NOTE[group] && <div className="text-[10px] text-muted mb-3">{GROUP_NOTE[group]}</div>}
          <div className="divide-y divide-[#1c2128]">
            {list.map((s) => {
              const has = s.key in draft;
              const v = has ? draft[s.key] : s.value;
              const shown = v === null ? s.default : v;
              const problem = has ? invalid(s, draft[s.key]) : null;
              const set = (x: SettingValue | null) =>
                setDraft((d) => {
                  const n = { ...d };
                  if (x !== null && same(x, s.value)) delete n[s.key];
                  else if (x === null && !s.is_set) delete n[s.key];
                  else n[s.key] = x;
                  return n;
                });
              return (
                <div key={s.key} className="py-2 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div className="text-xs">
                      {s.label}
                      {has && <span className="ml-2 text-yellow text-[10px]">changed</span>}
                    </div>
                    <div className="text-[10px] text-muted">
                      {s.help} Default {Array.isArray(s.default) ? (s.default.length ? s.default.join(", ") : "none") : String(s.default)}{s.unit && !Array.isArray(s.default) ? ` ${s.unit}` : ""}.
                      {s.is_set && s.updated_at && ` Set ${new Date(s.updated_at).toLocaleString()}.`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.kind === "bool" ? (
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={Boolean(shown)} onChange={(e) => set(e.target.checked)} />
                        {shown ? "on" : "off"}
                      </label>
                    ) : s.kind === "ids" ? (
                      <>
                        <IdsInput value={Array.isArray(shown) ? shown : []} bad={!!problem} onChange={set} />
                        <span className="text-[10px] text-muted w-20">{s.unit}</span>
                      </>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={s.min}
                          max={s.max}
                          step={s.kind === "int" ? 1 : "any"}
                          value={Number.isNaN(shown as number) ? "" : String(shown)}
                          onChange={(e) => set(e.target.value === "" ? NaN : Number(e.target.value))}
                          className={`w-24 bg-bg border rounded px-2 py-1 text-xs text-right ${problem ? "border-red-400" : "border-border"}`}
                        />
                        <span className="text-[10px] text-muted w-20">{s.unit}</span>
                      </>
                    )}
                    {(s.is_set || has) && v !== null && (
                      <button className="text-[10px] text-muted hover:text-accent" onClick={() => set(null)} title="back to the default">
                        default
                      </button>
                    )}
                  </div>
                  {problem && <div className="col-span-2 text-[10px] text-red-400">must be {problem}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3 sticky bottom-0 bg-bg py-3 border-t border-border">
        <button
          disabled={!dirty.length || bad || busy}
          onClick={save}
          className="px-4 py-1.5 rounded bg-accent text-bg text-xs font-semibold disabled:opacity-40"
        >
          {busy ? "saving…" : `Save${dirty.length ? ` (${dirty.length})` : ""}`}
        </button>
        {dirty.length > 0 && (
          <button className="text-xs text-muted hover:text-accent" onClick={() => setDraft({})}>discard changes</button>
        )}
        {err && <span className="text-xs text-red-400">{err}</span>}
        {saved && !dirty.length && <span className="text-xs text-green">{saved}</span>}
      </div>
    </div>
  );
}

// card ids as "5217, 12": kept as typed while editing, parsed to numbers
function IdsInput({ value, bad, onChange }: { value: number[]; bad: boolean; onChange: (v: number[]) => void }) {
  const parse = (t: string) => t.split(/[\s,]+/).filter(Boolean).map(Number);
  const [text, setText] = useState(value.join(", "));
  // follow outside changes (reset to default, saved) without fighting the typing
  useEffect(() => {
    if (parse(text).join(",") !== value.join(",")) setText(value.join(", "));
  }, [value.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input value={text} placeholder="e.g. 5217"
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
      className={`w-40 bg-bg border rounded px-2 py-1 text-xs ${bad ? "border-red-400" : "border-border"}`} />
  );
}

// the admin token for this browser (kept in localStorage, never in the build);
// checked against the API on load and before saving. Not needed when signed
// in with Google.
function TokenBox() {
  const { available, session } = useAuth();
  const [v, setV] = useState("");
  const [state, setState] = useState<"none" | "checking" | "ok" | "bad" | "unknown">(() => (getToken() ? "checking" : "none"));
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const t = getToken();
    if (t) checkToken(t).then((ok) => setState(ok === true ? "ok" : ok === false ? "bad" : "unknown"));
  }, []);
  const save = async () => {
    const t = cleanToken(v);
    if (!t) return;
    setState("checking");
    const ok = await checkToken(t);
    if (ok === false) { setState(getToken() ? "bad" : "none"); setMsg("the API rejected that token: not saved (paste the ADMIN_API_TOKEN value from 109)"); return; }
    setToken(t); setV(""); setState(ok ? "ok" : "unknown");
    setMsg(ok ? "saved and accepted by the API" : "saved (couldn't reach the API to check)");
  };
  const remove = () => { setToken(""); setState("none"); setMsg("removed"); };
  const label = { none: ["text-yellow", "not set: saving, review and in-hand scans need it"], checking: ["text-muted", "checking…"],
    ok: ["text-green", "set and accepted"], bad: ["text-red-400", "set but rejected by the API: paste the current token"],
    unknown: ["text-muted", "set (couldn't check)"] }[state];
  return (
    <div className="mt-2 mb-3 bg-surface border border-border rounded p-2 text-xs space-y-2">
    {available && (
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Account</span>
        {session ? <span className="text-green">signed in: saving, review and in-hand scans work on this device</span>
          : <span className="text-yellow">signed out</span>}
        <AccountButton />
      </div>
    )}
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">API token</span>
      {available && <span className="text-muted">(only needed without sign-in)</span>}
      <span className={label[0]}>{label[1]}</span>
      <input type="password" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
        placeholder="paste ADMIN_API_TOKEN" className="bg-bg border border-border rounded px-2 py-1 outline-none focus:border-accent w-72" />
      <button disabled={!v.trim() || state === "checking"} onClick={() => void save()} className="border border-accent/40 text-accent rounded px-2 py-1 disabled:opacity-40">save</button>
      {state !== "none" && <button onClick={remove} className="border border-border text-muted rounded px-2 py-1">remove</button>}
      {msg && <span className="text-muted">{msg}</span>}
    </div>
    </div>
  );
}
