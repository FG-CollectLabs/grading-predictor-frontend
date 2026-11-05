import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CopyRow } from "../types";
import { certLookupUrl } from "./CopyReview";

// Scans to pull: copies whose listing has no photo showing the full front or
// back (after the photo matcher and the AI picker had a go). For each one,
// open the grader's cert page, save their scan and drop it here. Once both
// sides are stored the copy goes on: a new front sends it back through the AI
// card / grade / cert check, then to centering.

const PAGE = 50;

export default function Scans() {
  const [items, setItems] = useState<CopyRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const load = useCallback(() => {
    const q = new URLSearchParams({ station: "photos", state: "scans", limit: String(PAGE), offset: String(offset) });
    api.listCopies(q).then((r) => { setItems(r.items); setTotal(r.total); }).catch((e: unknown) => setErr(String(e)));
  }, [offset]);
  useEffect(load, [load]);

  const finished = (id: number) => {
    setDone((d) => d + 1);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
  };

  if (err && !items) return <div className="text-red-400 text-xs">{err}</div>;
  if (!items) return <div className="text-muted text-xs">loading…</div>;

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / scans to pull</div>
        <h1 className="text-lg font-semibold mt-1">Scans to pull <span className="text-muted text-sm font-normal">({total.toLocaleString()})</span></h1>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          No listing photo shows the full slab on these sides. Open the grader's cert page, save their front / back scan, then
          drop it on the missing side (or click it to choose a file, or copy the image and use "paste"). When both sides are
          stored the copy moves on: the AI checks card, grade and cert on the new front, then centering measures it.
          No scans on the cert page either? Remove the copy.
        </p>
        {done > 0 && <div className="text-green text-xs mt-1">{done} done this session.</div>}
      </div>

      {items.length === 0 ? (
        <div className="text-muted text-xs">Nothing to pull{offset ? " on this page" : ""}.</div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => <Row key={c.id} c={c} onDone={() => finished(c.id)} />)}
        </div>
      )}

      {total > PAGE && (
        <div className="flex gap-3 text-xs">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="text-accent disabled:text-muted">← previous</button>
          <span className="text-muted">{offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}</span>
          <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="text-accent disabled:text-muted">next →</button>
        </div>
      )}
    </div>
  );
}

function Row({ c: initial, onDone }: { c: CopyRow; onDone: () => void }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lookup = c.cert_number ? certLookupUrl(c.grader, c.cert_number) : null;

  const upload = async (side: "front" | "back", file: File) => {
    setBusy(side);
    setErr(null);
    try {
      await api.uploadCertImage(c.id, side, file);
      const d = await api.getCopy(c.id);
      const next = { ...c, front_image: d.front_image, back_image: d.back_image };
      setC(next);
      if (next.front_image && next.back_image) {
        await api.postStep(c.id, { step: "photos", decision: "fixed", tags: ["better_photo_available"],
          note: "grader scans", payload: { uploaded: "scans" } });
        onDone();
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove copy #${c.id} from the dataset (no full photo and no grader scans)?`)) return;
    setBusy("remove");
    setErr(null);
    try {
      const text = "card cut off / no full photo: no grader scans either";
      await api.reviewCopy(c.id, { verdict: "unusable", tags: ["poor_quality"], note: text });
      await api.postStep(c.id, { step: "complete", decision: "rejected", tags: ["poor_quality"], note: `removed from dataset · ${text}` });
      onDone();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-md p-3 grid grid-cols-[88px_88px_1fr] gap-3 items-start">
      <Side side="front" path={c.front_image} busy={busy === "front"} onFile={(f) => upload("front", f)} />
      <Side side="back" path={c.back_image} busy={busy === "back"} onFile={(f) => upload("back", f)} />
      <div className="min-w-0 text-xs space-y-1">
        <div className="font-semibold truncate">
          {c.card_name} <span className="text-muted font-normal">#{c.card_number} · {c.set_name}{c.language && c.language !== "en" ? ` · ${c.language.toUpperCase()}` : ""}</span>
        </div>
        <div>
          {c.grader} {c.grade ?? "?"}{c.grade_label ? ` ${c.grade_label}` : ""} · cert{" "}
          {c.cert_number ? (
            <>
              <span className="font-mono">{c.cert_number}</span>
              <button className="ml-1 text-[10px] text-muted hover:text-accent" onClick={() => navigator.clipboard.writeText(c.cert_number)}>copy</button>
            </>
          ) : <span className="text-muted">not known</span>}
        </div>
        <div className="flex flex-wrap gap-3">
          {lookup ? (
            <a href={lookup} target="_blank" rel="noreferrer" className="text-accent hover:underline">{c.grader} cert page ↗</a>
          ) : (
            <span className="text-muted">{c.cert_number ? `no cert page link for ${c.grader}` : "no cert: check the listing"}</span>
          )}
          {c.source_ref && <a href={c.source_ref} target="_blank" rel="noreferrer" className="text-accent hover:underline">listing ↗</a>}
          <Link to={`/copies/${c.id}?station=photos&state=scans`} className="text-accent hover:underline">open copy #{c.id}</Link>
          <button disabled={busy !== null} onClick={remove} className="text-muted hover:text-red-400 disabled:opacity-40">no scans: remove</button>
        </div>
        {c.source_title && <div className="text-[10px] text-muted truncate">“{c.source_title}”</div>}
        {err && <div className="text-red-400 text-[10px]">{err}</div>}
      </div>
    </div>
  );
}

function Side({ side, path, busy, onFile }: { side: "front" | "back"; path: string | null; busy: boolean; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const id = useId();
  const paste = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          onFile(new File([blob], `${side}.${type.split("/")[1]}`, { type }));
          return;
        }
      }
      alert("No image on the clipboard: right-click the scan, Copy image, then paste.");
    } catch {
      alert("The browser didn't allow reading the clipboard; drop or choose the file instead.");
    }
  };
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={`block aspect-[5/7] rounded border cursor-pointer overflow-hidden ${
          over ? "border-accent bg-accent/10" : path ? "border-border" : "border-dashed border-red-400/60 bg-red-500/5"
        }`}
        title={path ? `replace the ${side}` : `drop the grader's ${side} scan here`}
      >
        {busy ? (
          <div className="h-full flex items-center justify-center text-[10px] text-muted">uploading…</div>
        ) : path ? (
          <img src={imageUrl(path)} alt={side} loading="lazy" className="w-full h-full object-contain bg-bg" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[10px] text-red-400 text-center px-1">
            no {side}<span className="text-muted">drop scan</span>
          </div>
        )}
      </label>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button onClick={paste} className="w-full text-[10px] text-muted hover:text-accent">paste {side}</button>
    </div>
  );
}
