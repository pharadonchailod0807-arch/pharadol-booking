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
    titleClassName:
      "bg-gradient-to-b from-white via-[#d7d2c8] to-[#858078] text-[clamp(2.875rem,6.2vw,5.75rem)]",
    buttonBg: "#CDAE77",
    buttonHover: "#B9965D",
    ringColor: "#CDAE77",
    ringSoftColor: "rgba(205,174,119,0.45)",
    logoGlowColor: "rgba(15,61,49,0.35)",
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
      "linear-gradient(180deg, rgba(42, 23, 16, 0.74), rgba(26, 14, 10, 0.88))",
    titleClassName:
      "bg-gradient-to-b from-white via-[#F1DFC0] to-[#C9A46A] text-[clamp(2.625rem,5.6vw,5.125rem)]",
    buttonBg: "#C9A46A",
    buttonHover: "#B88F52",
    ringColor: "#C9A46A",
    ringSoftColor: "rgba(201,164,106,0.45)",
    logoGlowColor: "rgba(42,23,16,0.35)",
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

          <p className="mt-8 max-w-[92vw] text-center text-[clamp(11px,0.9vw,15px)] font-bold uppercase tracking-[0.34em] text-white/62 drop-shadow-[0_3px_18px_rgba(0,0,0,0.9)]">
            {copy.eyebrow}
          </p>
          <p className="mt-5 text-[clamp(13px,1vw,18px)] font-extrabold uppercase tracking-[0.34em] text-white/72 drop-shadow-[0_3px_18px_rgba(0,0,0,0.9)]">
            {copy.subEyebrow}
          </p>

          <h1 className="mt-6 w-full max-w-[calc(100vw-40px)] text-center leading-[0.98]">
            <span className="block text-[clamp(28px,3vw,48px)] font-extrabold text-white/95 drop-shadow-[0_5px_20px_rgba(0,0,0,0.95)]">
              Welcome to
            </span>
            <span
              className={`mx-auto mt-3 block w-full whitespace-normal break-words bg-clip-text px-1 font-black text-transparent drop-shadow-[0_11px_28px_rgba(0,0,0,0.95)] lg:whitespace-nowrap ${copy.titleClassName}`}
            >
              {copy.title}
            </span>
          </h1>

          <p className="mt-7 max-w-[760px] text-balance text-[clamp(15px,1.25vw,22px)] font-semibold leading-[1.7] text-white/68 drop-shadow-[0_3px_16px_rgba(0,0,0,0.9)]">
            {copy.description}
          </p>

          <button
            type="button"
            onClick={openDashboard}
            className="mt-9 inline-flex h-[56px] min-w-[220px] items-center justify-center gap-4 rounded-full bg-[#CDAE77] px-[34px] py-[13px] text-[16px] font-extrabold text-[#0B0B0D] shadow-[0_18px_42px_rgba(205,174,119,0.24)] transition hover:-translate-y-0.5 hover:bg-[#B9965D] active:translate-y-0 sm:h-[58px] sm:px-[38px] sm:text-[17px]"
          >
            เริ่มใช้งานระบบ
            <span aria-hidden="true">→</span>
          </button>

            <p className="mt-5 text-[clamp(12px,0.9vw,15px)] font-semibold text-white/42 sm:mt-6">
              {copy.signedInText}
            </p>

          <p className="absolute bottom-[-116px] text-[10px] font-black uppercase tracking-[0.14em] text-white/14 sm:text-xs">
            {copy.footerNote}
          </p>
        </section>
        <style jsx>{`
          @keyframes welcomeRingSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes welcomeSoftPulse {
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

          @keyframes welcomeGlowBreath {
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
            animation: welcomeRingSpin 34s linear infinite;
            transform-origin: center;
          }

          .pharadol-ring-pulse {
            animation: welcomeSoftPulse 4.8s ease-in-out infinite;
            transform-origin: center;
          }

          .pharadol-logo-glow {
            animation: welcomeGlowBreath 5.4s ease-in-out infinite;
          }
        `}</style>
      </main>
    );
  }

  if (isAdisorn) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#150B08] px-4 py-8 text-white">
        <div
          className="absolute inset-0 scale-[1.03] bg-cover bg-center opacity-[0.68]"
          style={{ backgroundImage: `url('${copy.backgroundImage}')` }}
        />
        <div className="absolute inset-0 bg-[#2A1710]/72" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,164,106,0.16),transparent_45%)]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent" />

        <section className="relative z-10 flex w-full max-w-[1120px] flex-col items-center text-center">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full sm:h-32 sm:w-32">
            <div className="adisorn-ring-pulse absolute inset-[-10px] rounded-full border border-[#C9A46A]/45" />
            <div className="adisorn-ring-spin absolute inset-[-21px] rounded-full border border-dashed border-white/22" />
            <div className="absolute inset-[-30px] rounded-full border border-[#C9A46A]/18" />
            <div className="adisorn-logo-glow absolute inset-[-26px] rounded-full bg-[#C9A46A]/14 blur-2xl" />
            <div className="relative h-full w-full overflow-hidden rounded-full border border-[#F3E6CF]/24 bg-[#2A1710]/88 shadow-[0_0_48px_rgba(0,0,0,0.38),inset_0_0_26px_rgba(201,164,106,0.12)]">
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

          <p className="mt-8 max-w-[92vw] text-center text-[clamp(11px,0.9vw,15px)] font-bold uppercase tracking-[0.28em] text-[#F3E6CF]/72 drop-shadow-[0_3px_18px_rgba(0,0,0,0.86)]">
            {copy.eyebrow}
          </p>
          <p className="mt-5 text-[clamp(13px,1vw,18px)] font-extrabold uppercase tracking-[0.3em] text-white/74 drop-shadow-[0_3px_18px_rgba(0,0,0,0.86)]">
            {copy.subEyebrow}
          </p>

          <h1 className="mt-6 w-full max-w-[calc(100vw-40px)] text-center leading-[1.02]">
            <span className="block text-[clamp(28px,3vw,48px)] font-extrabold text-white/94 drop-shadow-[0_5px_20px_rgba(0,0,0,0.88)]">
              Welcome to
            </span>
            <span
              className={`mx-auto mt-3 block w-full whitespace-normal break-words bg-clip-text px-1 font-black text-transparent drop-shadow-[0_11px_26px_rgba(0,0,0,0.88)] lg:whitespace-nowrap ${copy.titleClassName}`}
            >
              {copy.title}
            </span>
          </h1>

          <p className="mt-7 max-w-[760px] text-balance text-[clamp(15px,1.25vw,22px)] font-semibold leading-[1.7] text-white/70 drop-shadow-[0_3px_16px_rgba(0,0,0,0.86)]">
            {copy.description}
          </p>

          <button
            type="button"
            onClick={openDashboard}
            className="mt-9 inline-flex h-[56px] min-w-[220px] items-center justify-center gap-4 rounded-full bg-[#C9A46A] px-[34px] py-[13px] text-[16px] font-extrabold text-[#111111] shadow-[0_18px_42px_rgba(201,164,106,0.22)] transition hover:-translate-y-0.5 hover:bg-[#B88F52] active:translate-y-0 sm:h-[58px] sm:px-[38px] sm:text-[17px]"
          >
            เริ่มใช้งานระบบ
            <span aria-hidden="true">→</span>
          </button>

          <p className="mt-5 text-[clamp(12px,0.9vw,15px)] font-semibold uppercase text-white/42 sm:mt-6">
            เข้าสู่ระบบโดย ADISORN WEDDING STUDIO
          </p>
        </section>
        <style jsx>{`
          @keyframes welcomeRingSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes welcomeRingReverseSpin {
            from {
              transform: rotate(360deg);
            }
            to {
              transform: rotate(0deg);
            }
          }

          @keyframes welcomeSoftPulse {
            0%,
            100% {
              opacity: 0.42;
              transform: scale(1);
            }
            50% {
              opacity: 0.86;
              transform: scale(1.045);
            }
          }

          @keyframes welcomeGlowBreath {
            0%,
            100% {
              opacity: 0.74;
              filter: drop-shadow(0 0 14px rgba(201, 164, 106, 0.18));
            }
            50% {
              opacity: 0.96;
              filter: drop-shadow(0 0 28px rgba(201, 164, 106, 0.32));
            }
          }

          .adisorn-ring-spin {
            animation: welcomeRingReverseSpin 38s linear infinite;
            transform-origin: center;
          }

          .adisorn-ring-pulse {
            animation: welcomeSoftPulse 5.2s ease-in-out infinite;
            transform-origin: center;
          }

          .adisorn-logo-glow {
            animation: welcomeGlowBreath 5.6s ease-in-out infinite;
          }
        `}</style>
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
