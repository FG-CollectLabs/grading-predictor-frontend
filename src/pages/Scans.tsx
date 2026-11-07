import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CopyRow } from "../types";
import { certLookupUrl } from "./CopyReview";

// Scans to pull: copies whose listing has no photo showing the full front or
// back (after the photo matcher, the AI picker and, when there's no cert, the
// AI cert read had a go). For each one, open the grader's cert page, save
// their scan and drop it here. Once both sides are stored the copy goes on: a
// new front sends it back through the AI card / grade / cert check, then to
// centering. Copies with no cert can't be looked up; they're listed apart.

const PAGE = 50;

export default function Scans() {
  // a drop that misses a target would make the browser open the image in a
  // new tab: swallow those on this page
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  const [done, setDone] = useState(0);
  const bump = () => setDone((d) => d + 1);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / scans to pull</div>
        <h1 className="text-lg font-semibold mt-1">Scans to pull</h1>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          No listing photo shows the full slab on these sides. Open the grader's cert page, save their front / back scan, then
          drop it on the missing side on the right. Dragging the scan straight from PSA's or CGC's cert page works (for PSA the
          full-size scan is fetched, not the small one the page shows); you can also click the box to choose a file, or copy the image
          (or its address) and use "paste".
          When both sides are stored the copy moves on: the AI checks card, grade and cert on the new front, then centering
          measures it. No scans on the cert page either? Remove the copy. Copies with no cert number are kept when the
          listing has both a full front and back, and removed otherwise (their scans can't be looked up).
        </p>
        {done > 0 && <div className="text-green text-xs mt-1">{done} done this session.</div>}
      </div>

      <Section cert="present" title="With a cert number" empty="Nothing to pull." onDone={bump} />
      <Section cert="missing" title="No cert number: removed from the dataset automatically within a few minutes"
        empty="None." onDone={bump} />
    </div>
  );
}

function Section({ cert, title, empty, onDone }: { cert: "present" | "missing"; title: string; empty: string; onDone: () => void }) {
  const [items, setItems] = useState<CopyRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ station: "photos", state: "scans", cert, limit: String(PAGE), offset: String(offset) });
    api.listCopies(q).then((r) => { setItems(r.items); setTotal(r.total); }).catch((e: unknown) => setErr(String(e)));
  }, [cert, offset]);
  useEffect(load, [load]);

  const finished = (id: number) => {
    onDone();
    setTotal((t) => t - 1);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold">{title} <span className="text-muted font-normal">({total.toLocaleString()})</span></h2>
        <DropNonEnglish cert={cert} onDone={() => { onDone(); load(); }} />
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {!items ? (
        <div className="text-muted text-xs">loading…</div>
      ) : items.length === 0 ? (
        <div className="text-muted text-xs">{empty}</div>
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
    </section>
  );
}

function Row({ c: initial, onDone }: { c: CopyRow; onDone: () => void }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lookup = c.cert_number ? certLookupUrl(c.grader, c.cert_number) : null;

  // a file, the address of a grader's scan, or both (a drop from the cert
  // page carries both: the address gets the full-size scan, the file is the
  // fallback when the API can't fetch it)
  const upload = async (side: "front" | "back", src: Dropped) => {
    setBusy(side);
    setErr(null);
    try {
      if (typeof src === "string") await api.uploadCertImageFromUrl(c.id, side, src);
      else if (src instanceof File) await api.uploadCertImage(c.id, side, src);
      else {
        try {
          await api.uploadCertImageFromUrl(c.id, side, src.url);
        } catch (e) {
          if (/is for cert/.test(String(e))) throw e; // the scan of another slab: don't store it at all
          await api.uploadCertImage(c.id, side, src.file);
        }
      }
      const d = await api.getCopy(c.id);
      const next = { ...c, front_image: d.front_image, back_image: d.back_image };
      setC(next);
      if (next.front_image && next.back_image) {
        await api.postStep(c.id, { step: "photos", decision: "fixed", tags: ["better_photo_available"],
          note: "grader scans", payload: { uploaded: "scans" } });
        onDone();
      }
    } catch (e) {
      const m = /scan is for cert (\d+)/.exec(String(e));
      setErr(m ? `That scan belongs to cert ${m[1]}, not this copy's ${c.cert_number}: the cert page you dragged from is still showing an earlier slab. Click "${c.grader} cert page" on this row and drag from that page.` : String(e));
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
    <div className="bg-surface border border-border rounded-md p-3 grid grid-cols-[1fr_auto] gap-4 items-center">
      <div className="min-w-0 text-xs space-y-1.5">
        <div className="font-semibold truncate">
          {c.card_name} <span className="text-muted font-normal">#{c.card_number} · {c.set_name}{c.language && c.language !== "en" ? ` · ${c.language.toUpperCase()}` : ""}</span>
        </div>
        <div>
          {c.grader} {c.grade ?? "?"}{c.grade_label ? ` ${c.grade_label}` : ""} · cert{" "}
          {c.cert_number ? (
            <>
              <span className="font-mono">{c.cert_number}</span>
              {c.cert_source === "ai" && <span className="text-[10px] text-muted"> (read by AI)</span>}
              <button className="ml-1 text-[10px] text-muted hover:text-accent" onClick={() => navigator.clipboard.writeText(c.cert_number)}>copy</button>
            </>
          ) : <span className="text-muted">not known</span>}
        </div>
        <div className="flex flex-wrap gap-3">
          {lookup ? (
            <a href={lookup} target="fg-grader-cert" title="opens in the same tab every time: move it next to this page once"
              className="text-accent hover:underline font-semibold">{c.grader} cert page ↗</a>
          ) : (
            <span className="text-muted">{c.cert_number ? `no cert page link for ${c.grader}` : "no cert to look up"}</span>
          )}
          {c.source_ref && <a href={c.source_ref} target="_blank" rel="noreferrer" className="text-accent hover:underline">listing ↗</a>}
          <Link to={`/copies/${c.id}?station=photos&state=scans`} className="text-accent hover:underline">open copy #{c.id}</Link>
          <button disabled={busy !== null} onClick={remove} className="text-muted hover:text-red-400 disabled:opacity-40">no scans: remove</button>
        </div>
        {c.source_title && <div className="text-[10px] text-muted truncate">“{c.source_title}”</div>}
        {err && <div className="text-red-400 text-[10px]">{err}</div>}
      </div>
      <div className="flex gap-3">
        <Side side="front" path={c.front_image} busy={busy === "front"} onFile={(f) => upload("front", f)} />
        <Side side="back" path={c.back_image} busy={busy === "back"} onFile={(f) => upload("back", f)} />
      </div>
    </div>
  );
}

type Dropped = File | string | { url: string; file: File };

// the graders' scan hosts: a drop from there uploads by address (the API
// fetches the full-size scan), with the dropped file as the fallback
const SCAN_HOST = /^https:\/\/(d1htnxwo4o0jhw\.cloudfront\.net\/cert\/|ccg-imaging-cgc-tradingcards-production\.s3\.amazonaws\.com\/)/i;

// the image address in a drop from another page or window. Chrome puts it in
// different places depending on where the image was dragged from.
function droppedUrl(dt: DataTransfer): string | null {
  const isUrl = (s: string) => /^https?:\/\//i.test(s);
  const uri = dt.getData("text/uri-list").split(/\r?\n/).map((s) => s.trim()).find((s) => s && !s.startsWith("#"));
  if (uri && isUrl(uri)) return uri;
  // Chrome's "DownloadURL": mime:filename:url
  const dl = /^[^:]+:[^:]*:(https?:\/\/.+)$/.exec(dt.getData("DownloadURL").trim())?.[1];
  if (dl) return dl;
  const src = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(dt.getData("text/html"))?.[1];
  if (src && isUrl(src)) return src.replace(/&amp;/g, "&");
  const text = dt.getData("text/plain").trim() || dt.getData("URL").trim();
  return isUrl(text) ? text : null;
}

// any file in the drop: Chrome may give an image dragged out of a web page no
// type or a generic one; the API checks the bytes are an image
function droppedFile(dt: DataTransfer): File | null {
  const fromItems = [...dt.items].filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => !!f);
  const all = [...dt.files, ...fromItems];
  return all.find((f) => f.type.startsWith("image/")) ?? all.find((f) => !f.type.startsWith("text/")) ?? null;
}

// what the browser actually handed over, for the hint when nothing was usable
function dropSummary(dt: DataTransfer): string {
  const types = [...dt.types];
  const files = [...dt.files].map((f) => `${f.name || "?"} (${f.type || "no type"}, ${f.size} B)`);
  return `types [${types.join(", ") || "none"}]${files.length ? ` files ${files.join("; ")}` : ""}`;
}

function Side({ side, path, busy, onFile }: { side: "front" | "back"; path: string | null; busy: boolean; onFile: (f: Dropped) => void }) {
  const [over, setOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const id = useId();
  const paste = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          setHint(null);
          onFile(new File([blob], `${side}.${type.split("/")[1]}`, { type }));
          return;
        }
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (/^https:\/\//.test(text)) { setHint(null); onFile(text); return; }
      setHint("no image on the clipboard: right-click the scan → Copy image (or Copy image address)");
    } catch {
      setHint("the browser blocked the clipboard: drop or choose the file");
    }
  };
  return (
    <div className="w-32 space-y-1">
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          // read everything now: the drop's data is gone after this handler
          const f = droppedFile(e.dataTransfer);
          const u = droppedUrl(e.dataTransfer);
          console.info("scan drop", side, dropSummary(e.dataTransfer), u);
          setHint(null);
          if (u && SCAN_HOST.test(u)) onFile(f ? { url: u, file: f } : u);
          else if (f) onFile(f);
          else if (u) onFile(u);
          else setHint(`nothing usable in that drop (${dropSummary(e.dataTransfer)}): click the box to choose the saved file, or right-click → Copy image → paste`);
        }}
        className={`block aspect-[5/7] rounded border-2 cursor-pointer overflow-hidden ${
          over ? "border-accent bg-accent/10" : path ? "border-border" : "border-dashed border-red-400/60 bg-red-500/5"
        }`}
        title={path ? `replace the ${side}` : `drop the grader's ${side} scan here`}
      >
        {busy ? (
          <div className="h-full flex items-center justify-center text-[10px] text-muted">uploading…</div>
        ) : path ? (
          <img src={imageUrl(path)} alt={side} loading="lazy" draggable={false} className="w-full h-full object-contain bg-bg" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-[11px] text-red-400 text-center px-2">
            no {side}<span className="text-muted text-[10px]">drop the scan here or click</span>
          </div>
        )}
      </label>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button onClick={paste} className="w-full text-[10px] text-muted hover:text-accent">paste {side}</button>
      {hint && <div className="text-[9px] text-yellow leading-tight">{hint}</div>}
    </div>
  );
}

// Only English cards are worth pulling scans for: remove every non-English
// copy waiting in this list (all pages), in one go.
function DropNonEnglish({ cert, onDone }: { cert: "present" | "missing"; onDone: () => void }) {
  const [ids, setIds] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const count = async () => {
    setBusy(true); setMsg(null);
    try {
      const found: number[] = [];
      for (let off = 0; ; off += 200) {
        const r = await api.listCopies(new URLSearchParams({ station: "photos", state: "scans", cert, limit: "200", offset: String(off) }));
        found.push(...r.items.filter((c) => c.language && c.language !== "en").map((c) => c.id));
        if (off + 200 >= r.total) break;
      }
      setIds(found);
      if (!found.length) setMsg("none here");
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const drop = async () => {
    if (!ids?.length) return;
    setBusy(true); setMsg(null);
    try {
      for (let i = 0; i < ids.length; i += 500) {
        await api.bulkReview({ station: "photos", action: "remove", ids: ids.slice(i, i + 500), note: "not English: scans are only pulled for English cards" });
      }
      setMsg(`removed ${ids.length}`);
      setIds(null);
      onDone();
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  return (
    <span className="text-xs flex items-center gap-2">
      {ids && ids.length > 0 ? (
        <>
          <button disabled={busy} onClick={drop} className="border border-red-400/50 text-red-400 rounded px-2 py-0.5 hover:bg-red-500/10 disabled:opacity-40">
            confirm: remove {ids.length} non-English
          </button>
          <button disabled={busy} onClick={() => setIds(null)} className="text-muted hover:text-[#e6edf3]">cancel</button>
        </>
      ) : (
        <button disabled={busy} onClick={count} className="border border-border rounded px-2 py-0.5 text-muted hover:text-red-400 disabled:opacity-40">
          {busy ? "counting…" : "remove all non-English…"}
        </button>
      )}
      {msg && <span className="text-muted">{msg}</span>}
    </span>
  );
}
