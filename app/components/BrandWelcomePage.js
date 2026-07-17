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
            <div className="absolute inset-[-11px] rounded-full border border-[#8d7651]/55" />
            <div className="absolute inset-[-22px] rounded-full border border-dashed border-white/18" />
            <div className="absolute inset-[-31px] rounded-full border border-white/10" />
            <div className="absolute inset-[-25px] rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="relative h-full w-full overflow-hidden rounded-full border border-emerald-300/25 bg-[#10291d] shadow-[0_0_48px_rgba(0,0,0,0.5),inset_0_0_28px_rgba(102,255,198,0.08)]">
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
            className="mt-9 inline-flex min-h-[72px] min-w-[320px] items-center justify-center gap-5 rounded-full bg-white/92 px-12 py-5 text-lg font-black text-zinc-950 shadow-[0_22px_58px_rgba(0,0,0,0.46)] transition hover:-translate-y-0.5 hover:bg-white active:translate-y-0"
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
