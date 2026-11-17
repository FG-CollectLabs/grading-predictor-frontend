import { useEffect, useState } from "react";
import { api } from "../api";

// <img> for API images that need the sign-in (inspection sheets of private
// copies, e.g. in-hand scans): fetched with auth, shown from a local URL.
export default function AuthImg({ src, alt, className, onClick, title, fallback }: {
  src: string; alt: string; className?: string; onClick?: () => void; title?: string; fallback?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    api.authImage(src).then((u) => { if (live) setUrl(u); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [src]);
  if (failed) return <div className={`${className ?? ""} flex items-center justify-center text-[10px] text-muted bg-bg rounded p-2`}>{fallback ?? "image unavailable"}</div>;
  if (!url) return <div className={`${className ?? ""} bg-bg rounded animate-pulse`} />;
  return <img src={url} alt={alt} className={className} onClick={onClick} title={title} />;
}

/** open an auth-only API image in a new tab */
export function openAuthImage(src: string) {
  const w = window.open("", "_blank");
  api.authImage(src).then((u) => { if (w) w.location.href = u; }).catch(() => w?.close());
}
