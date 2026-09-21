"use client";

/* eslint-disable @next/next/no-img-element */

const BRAND_DOCUMENTS = {
  pharadol: {
    name: "PHARADOL PRODUCTION",
    eyebrow: "FILM & STILL",
    logo: "/pharadol-logo.jpeg",
    logoClassName: "h-28 w-28 -ml-4 rounded-full object-cover",
    address: "988, 1 ถ.มิตรภาพ ต.ในเมือง อ.เมืองนครราชสีมา จ.นครราชสีมา 30000",
    email: "pharadol.production@gmail.com",
    phone: "0910649380",
    headerAlignClassName: "items-center",
    titleClassName: "text-xl",
    contactClassName: "text-[8px]",
  },
  adisorn: {
    name: "ADISORN WEDDING STUDIO",
    eyebrow: "",
    logo: "/logo.png",
    logoClassName: "h-24 w-24 rounded-full object-cover",
    address: "121 หมู่ 10 ตำบลไชยมงคล อำเภอเมือง จังหวัดนครราชสีมา 30000",
    email: "adisornweddingstudio@gmail.com",
    phone: "089 354 4429",
    headerAlignClassName: "items-start",
    titleClassName: "text-2xl",
    contactClassName: "text-[10px]",
  },
};

const TERMS = [
  {
    number: "01",
    icon: "booking",
    title: "การยืนยันการจอง",
    detail:
      "การยืนยันการจองจะถือว่าเสร็จสมบูรณ์ เมื่อลูกค้าชำระเงินมัดจำตามจำนวนที่สตูดิโอกำหนด และได้รับการยืนยันวันและเวลาจากทางสตูดิโอแล้ว",
  },
  {
    number: "02",
    icon: "camera",
    title: "การเพิ่ม/ลดแพ็กเกจ",
    detail:
      "หากมัดจำและจองแพ็คเกจช่างภาพหรือวีดีโอแล้ว ลูกค้าสามารถเพิ่มแพ็คเกจได้ แต่ไม่สามารถลดแพ็คเกจได้",
  },
  {
    number: "03",
    icon: "payment",
    title: "การชำระเงินส่วนที่เหลือ",
    detail:
      "ยอดค่าบริการที่เหลือทั้งหมด ลูกค้าต้องชำระภายในวันที่ถ่ายหรือหลังจบงานภายใน 24 ชม. ก่อนส่งมอบไฟล์งาน ตามเงื่อนไขของแพ็กเกจที่เลือก",
  },
  {
    number: "04",
    icon: "calendar",
    title: "การเลื่อนวันถ่ายภาพ",
    detail:
      "หากลูกค้ามีความจำเป็นต้องเลื่อนวันถ่ายภาพ กรุณาแจ้งล่วงหน้าอย่างน้อย 1 สัปดาห์ โดยสามารถเลื่อนได้ตามคิวว่างของสตูดิโอ ทั้งนี้ วันใหม่จะต้องได้รับการยืนยันจากทางสตูดิโอก่อนทุกครั้ง",
  },
  {
    number: "05",
    icon: "cancel",
    title: "การยกเลิกการจอง",
    detail:
      "หากลูกค้าขอยกเลิกการจองหลังจากชำระเงินมัดจำแล้ว เงินมัดจำดังกล่าวถือเป็นค่าล็อกคิวและค่าเตรียมงาน จึงไม่สามารถขอคืนได้",
  },
  {
    number: "06",
    icon: "time",
    title: "การมาสายของลูกค้า",
    detail:
      "กรณีลูกค้ามาถึงช้ากว่าเวลานัดหมาย เวลาที่เสียไปอาจถือเป็นส่วนหนึ่งของเวลาถ่ายภาพ และไม่สามารถขยายเวลาถ่ายภาพออกไปได้ หากมีคิวงานอื่นต่อจากนั้น ทั้งนี้ขึ้นอยู่กับความเหมาะสมของสถานการณ์",
  },
  {
    number: "07",
    icon: "delivery",
    title: "การส่งมอบผลงาน",
    detail:
      "สตูดิโอจะดำเนินการคัดเลือกและตกแต่งภาพตามรายละเอียดของแพ็กเกจ และส่งมอบผลงานภายในระยะเวลาที่กำหนด โดยระยะเวลาการส่งงานอาจเปลี่ยนแปลงได้ตามปริมาณงานหรือเหตุสุดวิสัย",
  },
  {
    number: "08",
    icon: "edit",
    title: "การแก้ไขและการเก็บไฟล์งาน",
    detail:
      "การแก้ไขภาพเป็นไปตามรายละเอียดของแพ็กเกจที่ลูกค้าเลือก หากต้องการแก้ไขเพิ่มเติมนอกเหนือจากเงื่อนไขที่กำหนด อาจมีค่าใช้จ่ายเพิ่มเติม และสตูดิโอแนะนำให้ลูกค้าสำรองไฟล์งานหลังจากได้รับงานเรียบร้อยแล้ว",
  },
  {
    number: "09",
    icon: "share",
    title: "การนำภาพไปใช้เพื่อประชาสัมพันธ์",
    detail:
      "สตูดิโออาจนำภาพที่ถ่ายไปใช้เพื่อประชาสัมพันธ์ผลงาน เช่น Facebook, Instagram, Website หรือสื่อโฆษณา โดยจะคำนึงถึงความเหมาะสมและความเป็นส่วนตัวของลูกค้าเป็นสำคัญ หากลูกค้าไม่ประสงค์ให้เผยแพร่ภาพ กรุณาแจ้งสตูดิโอก่อนวันถ่ายภาพ",
  },
];

const leftTerms = TERMS.slice(0, 5);
const rightTerms = TERMS.slice(5);

const iconPaths = {
  booking: (
    <>
      <path d="M5 6.5h14v13H5z" />
      <path d="M5 10h14" />
      <path d="M8 4.5v4" />
      <path d="M16 4.5v4" />
      <path d="m8 15 2 2 5-5" />
    </>
  ),
  camera: (
    <>
      <path d="M5 8.5h3l1.5-2h5l1.5 2h3v10H5z" />
      <path d="M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M17 11h.01" />
    </>
  ),
  payment: (
    <>
      <path d="M4 7h16v10H4z" />
      <path d="M4 10h16" />
      <path d="M7 14h4" />
    </>
  ),
  calendar: (
    <>
      <path d="M5 6.5h14v13H5z" />
      <path d="M5 10h14" />
      <path d="M8 4.5v4" />
      <path d="M16 4.5v4" />
    </>
  ),
  cancel: (
    <>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="M17.5 6.5 6.5 17.5" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    </>
  ),
  time: (
    <>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  delivery: (
    <>
      <path d="M5 6h10v9H5z" />
      <path d="M15 9h3l2 3v3h-5z" />
      <path d="M7.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M17.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </>
  ),
  edit: (
    <>
      <path d="M5 18.5 6 14l8.5-8.5 3 3L9 17z" />
      <path d="M13.5 6.5 16.5 9.5" />
      <path d="M5 20h14" />
    </>
  ),
  share: (
    <>
      <path d="M8 12h8" />
      <path d="M13 7l5 5-5 5" />
      <path d="M6 5h4" />
      <path d="M6 19h4" />
      <path d="M4 7V5h2" />
      <path d="M4 17v2h2" />
    </>
  ),
};

const TermIcon = ({ type }) => (
  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-950">
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[type] || iconPaths.booking}
    </svg>
  </div>
);

const TermCard = ({ term }) => (
  <article className="grid h-[118px] grid-cols-[38px_44px_1fr] gap-3 rounded-xl border border-zinc-200 bg-white p-3.5">
    <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold leading-none text-white">
      {term.number}
    </div>
    <TermIcon type={term.icon} />
    <div className="min-w-0">
      <h3 className="text-[12px] font-bold leading-tight text-zinc-950">
        {term.title}
      </h3>
      <p className="mt-1.5 text-[9.4px] font-medium leading-[1.48] text-zinc-700">
        {term.detail}
      </p>
    </div>
  </article>
);

export default function BookingTermsPage({
  brandId,
  headerMeta,
  signatureDate,
}) {
  const brand = BRAND_DOCUMENTS[brandId] || BRAND_DOCUMENTS.pharadol;

  return (
    <div className="print-area terms-page bg-white w-[210mm] h-[297mm] mx-auto shadow-2xl px-7 py-6 flex flex-col overflow-hidden mt-10">
      <div
        className={`flex justify-between ${brand.headerAlignClassName} pb-4 shrink-0`}
      >
        <div className="flex -translate-y-3 items-center gap-3">
          <img
            src={brand.logo}
            alt={brand.name}
            width="112"
            height="112"
            loading="lazy"
            decoding="async"
            className={brand.logoClassName}
          />

          <div>
            {brand.eyebrow && (
              <p className="mt-0 mb-0.5 text-xs font-semibold tracking-[0.18em] text-zinc-700 leading-none">
                {brand.eyebrow}
              </p>
            )}
            <h1
              className={`${brand.titleClassName} font-bold leading-tight whitespace-nowrap`}
            >
              {brand.name}
            </h1>
            <p
              className={`mt-1 max-w-[310px] text-zinc-600 ${brand.contactClassName} leading-tight`}
            >
              {brand.address}
            </p>
            <p
              className={`mt-0.5 text-zinc-600 ${brand.contactClassName} leading-tight`}
            >
              {brand.email}&nbsp;&nbsp;|&nbsp;&nbsp;โทร. {brand.phone}
            </p>
          </div>
        </div>

        {headerMeta}
      </div>

      <div className="-translate-y-5 border-t border-black shrink-0" />

      <section className="text-center pb-4 shrink-0">
        <h2 className="text-[30px] font-bold leading-tight text-zinc-950">
          รายละเอียดและเงื่อนไขการให้บริการ
        </h2>
        <p className="mt-1.5 text-[12.5px] font-semibold text-zinc-500">
          กรุณาอ่านรายละเอียดและเงื่อนไขก่อนยืนยันการจอง
        </p>
      </section>

      <section className="grid shrink-0 grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          {leftTerms.map((term) => (
            <TermCard key={term.number} term={term} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rightTerms.map((term) => (
            <TermCard key={term.number} term={term} />
          ))}
        </div>
      </section>

      <section className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-[10px] leading-relaxed text-zinc-700 shrink-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-zinc-900">
          !
        </div>
        <div>
          <p className="text-[12px] font-bold leading-tight text-zinc-950">หมายเหตุ</p>
          <p className="mt-0.5">
            เงื่อนไขข้างต้นสามารถปรับเปลี่ยนได้ตามลักษณะงาน แพ็กเกจ และข้อตกลงระหว่างสตูดิโอกับลูกค้า
          </p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4 shrink-0">
        <div className="rounded-xl border border-zinc-200 px-4 py-3.5 text-center">
          <p className="text-sm font-semibold text-zinc-900">ลูกค้า</p>
          <div className="mt-5 border-b border-zinc-400" />
          <p className="mt-2 text-[10px] text-zinc-500">
            วันที่ ......... / ......... / .........
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 px-4 py-3.5 text-center">
          <p className="text-sm font-semibold text-zinc-900">{brand.name}</p>
          <div className="mt-5 border-b border-zinc-400" />
          <p className="mt-2 text-[10px] text-zinc-500">
            วันที่ {signatureDate || "-"}
          </p>
        </div>
      </section>

      <footer className="mt-3 pr-28 text-[8px] leading-snug text-zinc-500 shrink-0">
        <p className="font-semibold text-zinc-700">{brand.name}</p>
        <p>{brand.address}</p>
        <p>
          {brand.email} | โทร. {brand.phone}
        </p>
      </footer>
    </div>
  );
}
