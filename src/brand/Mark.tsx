import { BAND_ON_DARK, COMPANY_NAME, NAVY } from "./brand";

// The FGL "FG Slab" mark, dark version (white slab, for dark backgrounds),
// from the brand kit. Only the band colour may change: never recolour the
// letters or stretch the slab. Under 48 px tall it draws the kit's 32-grid
// version, which keeps the letters legible at small sizes.
export function Mark({ height = 56, band = BAND_ON_DARK }: { height?: number; band?: string }) {
  if (height < 48) {
    return (
      <svg viewBox="6 1 20 30" height={height} width={(height * 20) / 30} role="img" aria-label={COMPANY_NAME}>
        <rect x="6" y="1" width="20" height="30" rx="3" fill="#FFFFFF" />
        <rect x="8" y="3" width="16" height="5" rx="1" fill={band} />
        <rect x="8" y="10" width="16" height="19" rx="1" fill={NAVY} />
        {[[10, 13, 2, 13], [10, 13, 5, 2], [10, 19, 4, 2], [16, 13, 6, 2], [16, 13, 2, 13], [16, 24, 6, 2], [20, 19, 2, 7], [19, 19, 3, 2]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="#FFFFFF" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="12 2 40 60" height={height} width={(height * 40) / 60} role="img" aria-label={COMPANY_NAME}>
      <rect x="12" y="2" width="40" height="60" rx="6" fill="#FFFFFF" />
      <rect x="17" y="7" width="30" height="10" rx="2" fill={band} />
      <rect x="17" y="21" width="30" height="36" rx="2" fill={NAVY} />
      {[[19.5, 27, 5, 24], [19.5, 27, 12, 5], [19.5, 37.08, 9.6, 4.5], [32.5, 27, 12, 5], [32.5, 27, 5, 24], [32.5, 46, 12, 5], [39.5, 38.52, 5, 12.48], [38.5, 38.52, 6, 5]].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#FFFFFF" />
      ))}
    </svg>
  );
}
