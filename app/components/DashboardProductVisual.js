"use client";

const iconConfig = {
  document: { accent: "#16a7ff", glow: "#005dff", glyph: "document" },
  customers: { accent: "#b35cff", glow: "#6b1fff", glyph: "customers" },
  archive: { accent: "#ffb13b", glow: "#8f5200", glyph: "archive" },
  calendar: { accent: "#ff4545", glow: "#8d1010", glyph: "calendar" },
  trash: { accent: "#9fb1c4", glow: "#3c4855", glyph: "trash" },
  income: { accent: "#ffcc32", glow: "#a46b00", glyph: "income" },
  reports: { accent: "#20d0ff", glow: "#006b8b", glyph: "reports" },
  bell: { accent: "#ff9f2f", glow: "#9a3d00", glyph: "bell" },
  settings: { accent: "#61e38a", glow: "#087a34", glyph: "settings" },
};

const Glyph = ({ type, id, accent }) => {
  if (type === "document") {
    return (
      <>
        <rect x="57" y="50" width="14" height="70" rx="7" fill={accent} opacity="0.38" />
        <rect x="67" y="38" width="69" height="82" rx="16" fill={`url(#darkBody-${id})`} />
        <rect x="72" y="43" width="59" height="72" rx="12" fill="rgba(255,255,255,0.08)" />
        <path d="M100 38h20l16 16v16h-36Z" fill={`url(#face-${id})`} />
        <path d="M100 38v32h36" stroke={accent} strokeWidth="2.5" opacity="0.65" />
        <path d="M82 78h36M82 94h30M82 110h22" stroke="#b9efff" strokeWidth="7" strokeLinecap="round" />
        <path d="M75 47c12-7 31-8 48-4" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.32" />
      </>
    );
  }

  if (type === "customers") {
    return (
      <>
        <circle cx="84" cy="62" r="24" fill={`url(#face-${id})`} />
        <circle cx="122" cy="72" r="19" fill={`url(#softFace-${id})`} />
        <circle cx="83" cy="55" r="12" fill="rgba(255,255,255,0.28)" />
        <circle cx="118" cy="66" r="8" fill="rgba(255,255,255,0.34)" />
        <path d="M48 124c8-33 27-50 57-50s50 17 58 50" fill={`url(#darkBody-${id})`} />
        <path d="M73 124c5-20 17-30 35-30s30 10 36 30" fill="rgba(255,255,255,0.2)" />
        <path d="M50 124c24 8 82 8 112 0" stroke={accent} strokeWidth="2.5" opacity="0.45" />
      </>
    );
  }

  if (type === "archive") {
    return (
      <>
        <path d="M66 68h86v61c0 5-4 9-9 9H75c-5 0-9-4-9-9Z" fill={`url(#darkBody-${id})`} />
        <path d="M77 49h64l16 25H61Z" fill={`url(#boxLid-${id})`} />
        <path d="M61 74h96l-9 10H70Z" fill="rgba(255,255,255,0.16)" />
        <path d="M75 78h70v49H75Z" fill="rgba(7,10,15,0.34)" />
        <path d="M83 92h52" stroke={accent} strokeWidth="8" strokeLinecap="round" />
        <path d="M80 52h58" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.28" />
        <path d="M67 129c17 8 63 10 83 0" stroke={accent} strokeWidth="2.5" opacity="0.35" />
      </>
    );
  }

  if (type === "calendar") {
    return (
      <>
        <path d="M58 74c0-14 11-25 25-25h42c14 0 25 11 25 25v42c0 14-11 25-25 25H83c-14 0-25-11-25-25Z" fill={`url(#calendarPage-${id})`} />
        <path d="M58 77h92v17H58Z" fill={accent} />
        <path d="M58 94h92v22c0 14-11 25-25 25H83c-14 0-25-11-25-25Z" fill="rgba(255,255,255,0.92)" />
        <path d="M82 42v30M126 42v30" stroke={`url(#ring-${id})`} strokeWidth="10" strokeLinecap="round" />
        <circle cx="82" cy="74" r="6" fill="#101317" opacity="0.28" />
        <circle cx="126" cy="74" r="6" fill="#101317" opacity="0.28" />
        <text x="104" y="128" textAnchor="middle" fontSize="53" fontWeight="800" fill="#1d1d1f">17</text>
        <path d="M71 55c18-7 48-7 66 0" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.42" />
      </>
    );
  }

  if (type === "trash") {
    return (
      <>
        <path d="M68 64h78l-8 76H76Z" fill={`url(#metal-${id})`} />
        <path d="M74 70h65l-6 61H80Z" fill="rgba(7,10,15,0.22)" />
        <path d="M59 58h96" stroke={`url(#chrome-${id})`} strokeWidth="11" strokeLinecap="round" />
        <path d="M85 43h43" stroke={`url(#chrome-${id})`} strokeWidth="10" strokeLinecap="round" />
        <path d="M87 84v39M107 84v39M127 84v39" stroke="#10151b" strokeWidth="7" strokeLinecap="round" opacity="0.58" />
        <path d="M73 68c17-5 47-5 66 0" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.28" />
      </>
    );
  }

  if (type === "income") {
    return (
      <>
        <circle cx="106" cy="88" r="54" fill={`url(#coin-${id})`} />
        <circle cx="106" cy="88" r="43" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.36)" strokeWidth="3" />
        <circle cx="106" cy="88" r="50" stroke="#ffffff" strokeOpacity="0.24" strokeWidth="2" />
        <path d="M106 45v86M132 64c-10-9-52-12-52 10 0 28 55 12 55 41 0 24-42 24-63 6" stroke="#5b3700" strokeWidth="11" strokeLinecap="round" />
        <path d="M80 57c16-12 38-16 58-8" stroke="#fff1a5" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      </>
    );
  }

  if (type === "reports") {
    return (
      <>
        <rect x="56" y="48" width="96" height="86" rx="20" fill={`url(#darkBody-${id})`} />
        <path d="M78 113V91M103 113V68M128 113V82" stroke={accent} strokeWidth="10" strokeLinecap="round" />
        <path d="M74 76c18 11 34 8 48-7 10-10 22-11 36-4" stroke="#d9f8ff" strokeWidth="5" strokeLinecap="round" fill="none" />
      </>
    );
  }

  if (type === "bell") {
    return (
      <>
        <path d="M106 40c-31 0-49 23-49 57v23l-16 20h130l-16-20V97c0-34-18-57-49-57Z" fill={`url(#face-${id})`} />
        <circle cx="106" cy="148" r="14" fill={`url(#darkBody-${id})`} />
        <path d="M75 116h62" stroke="rgba(255,255,255,0.55)" strokeWidth="7" strokeLinecap="round" />
      </>
    );
  }

  return (
    <>
      <rect x="56" y="57" width="96" height="74" rx="24" fill={`url(#darkBody-${id})`} />
      <path d="M76 84h56M76 107h56" stroke="#e8fff0" strokeWidth="7" strokeLinecap="round" />
      <circle cx="86" cy="84" r="8" fill={accent} />
      <circle cx="121" cy="107" r="8" fill={accent} />
    </>
  );
};

export default function DashboardProductVisual({ name }) {
  const config = iconConfig[name] || iconConfig.document;
  const id = `neon-object-${name}`;

  return (
    <svg
      viewBox="0 0 220 180"
      className="h-full w-full"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`aura-${id}`} cx="0" cy="0" r="1" gradientTransform="translate(110 106) rotate(90) scale(92 108)">
          <stop stopColor={config.accent} stopOpacity="0.34" />
          <stop offset="0.42" stopColor={config.glow} stopOpacity="0.15" />
          <stop offset="1" stopColor={config.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`darkBody-${id}`} x1="56" y1="37" x2="153" y2="136">
          <stop stopColor="#3c4654" />
          <stop offset="0.52" stopColor="#101722" />
          <stop offset="1" stopColor="#03060b" />
        </linearGradient>
        <linearGradient id={`face-${id}`} x1="61" y1="39" x2="154" y2="131">
          <stop stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="0.18" stopColor={config.accent} />
          <stop offset="1" stopColor={config.glow} />
        </linearGradient>
        <linearGradient id={`boxLid-${id}`} x1="64" y1="48" x2="154" y2="80">
          <stop stopColor="#ffffff" />
          <stop offset="0.36" stopColor="#e7e0d4" />
          <stop offset="1" stopColor={config.glow} />
        </linearGradient>
        <linearGradient id={`softFace-${id}`} x1="97" y1="47" x2="146" y2="95">
          <stop stopColor="#ffffff" stopOpacity="0.94" />
          <stop offset="1" stopColor={config.accent} />
        </linearGradient>
        <linearGradient id={`paper-${id}`} x1="58" y1="44" x2="150" y2="135">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#d7dbe2" />
        </linearGradient>
        <linearGradient id={`calendarPage-${id}`} x1="60" y1="50" x2="149" y2="141">
          <stop stopColor="#ffffff" />
          <stop offset="0.58" stopColor="#f7f7f8" />
          <stop offset="1" stopColor="#d9d9dc" />
        </linearGradient>
        <linearGradient id={`ring-${id}`} x1="77" y1="42" x2="131" y2="73">
          <stop stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#5c6674" />
          <stop offset="1" stopColor="#191d24" />
        </linearGradient>
        <linearGradient id={`metal-${id}`} x1="60" y1="43" x2="145" y2="135">
          <stop stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#aeb8c5" />
          <stop offset="1" stopColor="#222832" />
        </linearGradient>
        <linearGradient id={`chrome-${id}`} x1="60" y1="43" x2="151" y2="62">
          <stop stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#9faabc" />
          <stop offset="1" stopColor="#28313c" />
        </linearGradient>
        <radialGradient id={`coin-${id}`} cx="0" cy="0" r="1" gradientTransform="translate(88 55) rotate(51) scale(96)">
          <stop stopColor="#fff3a7" />
          <stop offset="0.45" stopColor={config.accent} />
          <stop offset="1" stopColor="#7a4a00" />
        </radialGradient>
        <filter
          id={`objectShadow-${id}`}
          x="18"
          y="10"
          width="184"
          height="154"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx="0" dy="18" stdDeviation="13" floodColor={config.glow} floodOpacity="0.34" />
          <feDropShadow dx="0" dy="28" stdDeviation="18" floodColor="#000000" floodOpacity="0.46" />
        </filter>
      </defs>
      <ellipse cx="110" cy="139" rx="68" ry="15" fill="rgba(0,0,0,0.46)" />
      <circle cx="110" cy="92" r="84" fill={`url(#aura-${id})`} />
      <g opacity="0.9" stroke={config.accent} strokeWidth="1.15" fill="none">
        <ellipse cx="110" cy="124" rx="78" ry="20" />
        <ellipse cx="110" cy="124" rx="58" ry="14" opacity="0.54" />
        <ellipse cx="110" cy="124" rx="36" ry="8" opacity="0.34" />
        <path d="M30 124h34M156 124h34M110 91v19M74 109l-18-12M146 109l18-12" opacity="0.45" />
        <path d="M52 134c22 18 94 18 116 0" opacity="0.22" />
      </g>
      <g opacity="0.28" stroke={config.accent} strokeWidth="0.9" fill="none">
        <path d="M37 98h20l12-12h21M132 86h22l13 13h18" />
        <path d="M48 77h18l10-10M153 67h16l11-11" />
        <path d="M42 144h36M142 144h36" />
      </g>
      <g filter={`url(#objectShadow-${id})`}>
        <Glyph type={config.glyph} id={id} accent={config.accent} />
      </g>
    </svg>
  );
}
