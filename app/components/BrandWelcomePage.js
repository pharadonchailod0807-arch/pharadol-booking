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
      "ระบบจัดการงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และการแจ้งเตือนสำคัญของสตูดิโอ",
    logoClassName: "scale-[1.35] object-cover",
    overlay:
      "linear-gradient(180deg, rgba(3, 18, 12, 0.82), rgba(5, 23, 16, 0.9))",
  },
  adisorn: {
    backgroundImage: "/adisorn-wedding-bg.jpg",
    logo: "/adisorn-logo.png",
    eyebrow: "ADISORN WEDDING STUDIO BOOKING MANAGEMENT",
    subEyebrow: "WEDDING STUDIO",
    title: "Adisorn Wedding Studio",
    description:
      "ระบบจัดการงานแต่งงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และข้อมูลสำคัญของสตูดิโอ",
    logoClassName: "object-contain p-2",
    overlay:
      "linear-gradient(180deg, rgba(40, 18, 8, 0.8), rgba(38, 17, 7, 0.9))",
  },
};

export default function BrandWelcomePage({ brandId }) {
  const router = useRouter();
  const theme = getBrandTheme(brandId);
  const copy = welcomeCopy[brandId] || welcomeCopy.pharadol;

  const openDashboard = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("lastActivity", String(Date.now()));
    }
    router.push(`/${brandId}/dashboard`);
  };

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
