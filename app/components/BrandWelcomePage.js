"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { getBrandTheme } from "@/app/lib/brandThemes";

const welcomeCopy = {
  pharadol: {
    backgroundImage: "/pharadol-wedding-bg.jpg",
    logo: "/pharadol-logo.jpeg",
    eyebrow: "PHARADOL PRODUCTION BOOKING MANAGEMENT",
    subEyebrow: "FILM & STILL",
    title: "PHARADOL PRODUCTION",
    description:
      "ระบบจัดการงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และข้อมูลทั้งหมดของ PHARADOL PRODUCTION",
    signedInText: "เข้าสู่ระบบโดย PHARADOL PRODUCTION",
    footerNote: "MAY BENZ | PRE WEDDING | 14.11.2025",
    logoClassName: "scale-[1.38] object-cover",
    overlay:
      "linear-gradient(180deg, rgba(3, 7, 6, 0.78), rgba(4, 5, 5, 0.86) 48%, rgba(3, 5, 4, 0.92))",
    radial:
      "radial-gradient(circle_at_center, rgba(255,255,255,0.07), transparent 45%)",
    logoBg: "#10291d",
    logoShadow: "rgba(0,0,0,0.42)",
  },
  adisorn: {
    backgroundImage: "/adisorn-wedding-bg.jpg",
    logo: "/adisorn-logo.png",
    eyebrow: "ADISORN WEDDING STUDIO BOOKING MANAGEMENT",
    subEyebrow: "WEDDING STUDIO",
    title: "Adisorn Wedding Studio",
    description:
      "ระบบจัดการงานแต่งงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และข้อมูลสำคัญของสตูดิโอ",
    signedInText: "เข้าสู่ระบบโดย Adisorn Wedding Studio",
    logoClassName: "object-contain p-2",
    overlay:
      "linear-gradient(180deg, rgba(40, 18, 8, 0.8), rgba(38, 17, 7, 0.9))",
  },
};

export default function BrandWelcomePage({ brandId }) {
  const router = useRouter();
  const theme = getBrandTheme(brandId);
  const copy = welcomeCopy[brandId] || welcomeCopy.pharadol;
  const isPharadol = brandId === "pharadol";
  const isAdisorn = brandId === "adisorn";

  const openDashboard = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("lastActivity", String(Date.now()));
    }
    router.push(`/${brandId}/dashboard`);
  };

  if (isPharadol) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050706] px-4 py-8 text-white">
        <div
          className="absolute inset-0 scale-[1.02] bg-cover bg-center opacity-[0.72]"
          style={{ backgroundImage: `url('${copy.backgroundImage}')` }}
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.075),transparent_46%)]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/90 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 to-transparent" />

        <section className="relative z-10 flex w-full max-w-[1500px] flex-col items-center text-center">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full sm:h-32 sm:w-32">
            <div className="pharadol-ring-pulse absolute inset-[-12px] rounded-full border border-[#CDAE77]/45" />
            <div className="pharadol-ring-spin absolute inset-[-22px] rounded-full border border-dashed border-white/25" />
            <div className="absolute inset-[-31px] rounded-full border border-[#CDAE77]/20" />
            <div className="pharadol-logo-glow absolute inset-[-25px] rounded-full bg-[#CDAE77]/20 blur-2xl" />
            <div className="relative h-full w-full overflow-hidden rounded-full border border-[#CDAE77]/28 bg-[#10291d] shadow-[0_0_24px_rgba(205,174,119,0.18),inset_0_0_28px_rgba(205,174,119,0.08)]">
              <Image
                src={copy.logo}
                alt={theme.name}
                fill
                sizes="128px"
                priority
                className={copy.logoClassName}
              />
            </div>
          </div>

          <p className="mt-8 max-w-[92vw] text-center text-xs font-black uppercase tracking-[0.34em] text-white/62 drop-shadow-[0_3px_18px_rgba(0,0,0,0.9)] sm:text-sm">
            {copy.eyebrow}
          </p>
          <p className="mt-4 text-sm font-black uppercase tracking-[0.34em] text-white/72 drop-shadow-[0_3px_18px_rgba(0,0,0,0.9)] sm:text-base">
            {copy.subEyebrow}
          </p>

          <h1 className="mt-5 w-full max-w-[calc(100vw-40px)] text-center leading-[1.04]">
            <span className="block text-3xl font-bold text-white/95 drop-shadow-[0_5px_20px_rgba(0,0,0,0.95)] sm:text-4xl">
              Welcome to
            </span>
            <span className="mx-auto mt-3 block w-full whitespace-normal break-words bg-gradient-to-b from-white via-[#d7d2c8] to-[#858078] bg-clip-text px-1 text-[clamp(2.35rem,4.9vw,5.35rem)] font-black text-transparent drop-shadow-[0_11px_28px_rgba(0,0,0,0.95)] sm:whitespace-nowrap">
              {copy.title}
            </span>
          </h1>

          <p className="mt-7 max-w-[860px] text-balance text-base font-semibold leading-8 text-white/68 drop-shadow-[0_3px_16px_rgba(0,0,0,0.9)] sm:text-lg">
            {copy.description}
          </p>

          <button
            type="button"
            onClick={openDashboard}
            className="mt-9 inline-flex h-[58px] min-w-[220px] items-center justify-center gap-4 rounded-full bg-[#CDAE77] px-[38px] py-[14px] text-[17px] font-extrabold text-[#0B0B0D] shadow-[0_18px_42px_rgba(205,174,119,0.24)] transition hover:-translate-y-0.5 hover:bg-[#B9965D] active:translate-y-0"
          >
            เริ่มใช้งานระบบ
            <span aria-hidden="true">→</span>
          </button>

          <p className="mt-6 text-xs font-semibold text-white/42 sm:text-sm">
            {copy.signedInText}
          </p>

          <p className="absolute bottom-[-116px] text-[10px] font-black uppercase tracking-[0.14em] text-white/14 sm:text-xs">
            {copy.footerNote}
          </p>
        </section>
        <style jsx>{`
          @keyframes slowSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes softPulse {
            0%,
            100% {
              opacity: 0.45;
              transform: scale(1);
            }
            50% {
              opacity: 0.85;
              transform: scale(1.04);
            }
          }

          @keyframes logoGlow {
            0%,
            100% {
              opacity: 0.72;
              box-shadow: 0 0 24px rgba(205, 174, 119, 0.18);
            }
            50% {
              opacity: 0.95;
              box-shadow: 0 0 42px rgba(205, 174, 119, 0.34);
            }
          }

          .pharadol-ring-spin {
            animation: slowSpin 34s linear infinite;
            transform-origin: center;
          }

          .pharadol-ring-pulse {
            animation: softPulse 4.8s ease-in-out infinite;
            transform-origin: center;
          }

          .pharadol-logo-glow {
            animation: logoGlow 5.4s ease-in-out infinite;
          }
        `}</style>
      </main>
    );
  }

  if (isAdisorn) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#120804] px-4 py-8 text-white">
        <div
          className="absolute inset-0 scale-[1.03] bg-cover bg-center opacity-[0.68]"
          style={{ backgroundImage: `url('${copy.backgroundImage}')` }}
        />
        <div className="absolute inset-0 bg-[#170904]/72" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(216,169,106,0.2),transparent_45%)]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent" />

        <section className="relative z-10 flex w-full max-w-[1180px] flex-col items-center text-center">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full sm:h-32 sm:w-32">
            <div className="absolute inset-[-10px] rounded-full border border-[#D8A96A]/45" />
            <div className="absolute inset-[-21px] rounded-full border border-dashed border-[#F4D6B2]/22" />
            <div className="absolute inset-[-30px] rounded-full border border-white/8" />
            <div className="absolute inset-[-26px] rounded-full bg-[#D8A96A]/14 blur-2xl" />
            <div className="relative h-full w-full overflow-hidden rounded-full border border-[#F4D6B2]/24 bg-[#3b1c0a]/88 shadow-[0_0_48px_rgba(0,0,0,0.42),inset_0_0_26px_rgba(216,169,106,0.13)]">
              <Image
                src={copy.logo}
                alt={theme.name}
                fill
                sizes="128px"
                priority
                className="object-contain p-3"
              />
            </div>
          </div>

          <p className="mt-8 max-w-[92vw] text-center text-xs font-black uppercase tracking-[0.28em] text-[#F4D6B2]/70 drop-shadow-[0_3px_18px_rgba(0,0,0,0.86)] sm:text-sm">
            {copy.eyebrow}
          </p>
          <p className="mt-4 text-sm font-black uppercase tracking-[0.3em] text-white/74 drop-shadow-[0_3px_18px_rgba(0,0,0,0.86)] sm:text-base">
            {copy.subEyebrow}
          </p>

          <h1 className="mt-5 w-full max-w-[calc(100vw-40px)] text-center leading-[1.08]">
            <span className="block text-3xl font-bold text-white/94 drop-shadow-[0_5px_20px_rgba(0,0,0,0.88)] sm:text-4xl">
              Welcome to
            </span>
            <span className="mx-auto mt-3 block w-full whitespace-normal break-words bg-gradient-to-b from-white via-[#F4D6B2] to-[#B87538] bg-clip-text px-1 text-[clamp(2.65rem,5.2vw,5.45rem)] font-black text-transparent drop-shadow-[0_11px_26px_rgba(0,0,0,0.88)] sm:whitespace-nowrap">
              {copy.title}
            </span>
          </h1>

          <p className="mt-7 max-w-[820px] text-balance text-base font-semibold leading-8 text-white/70 drop-shadow-[0_3px_16px_rgba(0,0,0,0.86)] sm:text-lg">
            {copy.description}
          </p>

          <button
            type="button"
            onClick={openDashboard}
            className="mt-9 inline-flex min-h-[64px] min-w-[280px] items-center justify-center rounded-full bg-[#D8A96A] px-10 py-4 text-base font-black text-[#111111] shadow-[0_20px_52px_rgba(0,0,0,0.34)] transition hover:-translate-y-0.5 hover:bg-[#BE8844] active:translate-y-0 sm:text-lg"
          >
            เริ่มใช้งานระบบ
          </button>

          <p className="mt-6 text-xs font-semibold text-white/42 sm:text-sm">
            {copy.signedInText}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-8 text-white">
      <div
        className="absolute inset-0 scale-[1.03] bg-cover bg-center"
        style={{ backgroundImage: `url('${copy.backgroundImage}')` }}
      />
      <div className="absolute inset-0" style={{ background: copy.overlay }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_42%)]" />

      <section className="relative z-10 flex w-full max-w-[1120px] flex-col items-center text-center">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white shadow-[0_26px_80px_rgba(0,0,0,0.38)] sm:h-32 sm:w-32">
          <div
            className="absolute inset-[-10px] rounded-[2.35rem] border"
            style={{ borderColor: `${theme.accent}66` }}
          />
          <div className="relative h-20 w-20 overflow-hidden rounded-full sm:h-24 sm:w-24">
            <Image
              src={copy.logo}
              alt={theme.name}
              fill
              sizes="96px"
              priority
              className={copy.logoClassName}
            />
          </div>
        </div>

        <p className="mt-8 max-w-[92vw] text-xs font-black uppercase text-white/68 sm:text-sm">
          {copy.eyebrow}
        </p>
        <p className="mt-4 text-sm font-black uppercase text-white/78 sm:text-base">
          {copy.subEyebrow}
        </p>

        <h1 className="mt-5 w-full max-w-[1040px] text-center leading-[1.08]">
          <span className="block text-3xl font-bold text-white/92 sm:text-4xl">
            Welcome to
          </span>
          <span className="mt-3 block whitespace-normal break-words text-5xl font-black text-white sm:text-6xl lg:text-7xl">
            {copy.title}
          </span>
        </h1>

        <p className="mt-7 max-w-[760px] text-base font-semibold leading-8 text-white/72 sm:text-lg">
          {copy.description}
        </p>

        <button
          type="button"
          onClick={openDashboard}
          className="mt-9 inline-flex min-h-14 min-w-[240px] items-center justify-center rounded-2xl px-8 py-4 text-base font-black text-zinc-950 shadow-[0_22px_60px_rgba(0,0,0,0.38)] transition hover:-translate-y-0.5 active:translate-y-0"
          style={{ backgroundColor: theme.accent }}
        >
          เริ่มใช้งานระบบ
        </button>
      </section>
    </main>
  );
}
