"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrandTheme } from "@/app/lib/brandThemes";
import { bangkokToday, lineMinor, minor, moneyText, thaiDate } from "@/lib/purchase/data";
import { button, danger, DateField, ErrorBox, Field, Heading, input, panel, post, primary, uploadFile, usePurchaseData } from "./ui";

const emptyItem = () => ({ id: crypto.randomUUID(), name: "", description: "", quantity: "1", unit: "ชิ้น", unit_price: "0", vendor: "", url: "", notes: "" });
const itemFields = [
  ["name", "ชื่อสินค้า", 200], ["vendor", "ชื่อร้านค้า", 200],
  ["quantity", "จำนวน", 10, "decimal"], ["unit", "หน่วยนับ", 40],
  ["unit_price", "ราคาต่อหน่วย", 12, "decimal"], ["url", "ลิงก์สินค้า", 1500],
  ["description", "รายละเอียดสินค้า", 1500], ["notes", "หมายเหตุสินค้า", 1500],
];
const moneyFields = [["shipping", "ค่าจัดส่ง"], ["discount", "ส่วนลด"], ["vat", "ภาษีมูลค่าเพิ่ม"]];
const requiredItems = ["name", "quantity", "unit", "unit_price"];
const images = "image/jpeg,image/png,image/webp";

function ItemRow({ item, index, write, drop, onFile, picture, canDrop }) {
  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-zinc-200 p-3 sm:p-4">
    <legend className="px-2 text-sm font-semibold">รายการที่ {index + 1}</legend>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {itemFields.map(([key, label, maxLength, keyboard]) => <Field key={key} label={label}>
        <input className={input} value={item[key]} maxLength={maxLength} inputMode={keyboard}
          type={key === "url" ? "url" : "text"} required={requiredItems.includes(key)}
          onChange={(event) => write(key, event.target.value)} />
      </Field>)}
      <Field label={picture ? "เปลี่ยนรูปสินค้า" : "รูปสินค้า"}>
        <input className={input} type="file" accept={images} onChange={(event) => onFile(event.target.files[0])} />
      </Field>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">ราคารวม ฿{moneyText(lineMinor(item.quantity, item.unit_price))}</span>
      {canDrop && <button type="button" className={danger} onClick={drop}>ลบรายการ</button>}
    </div>
  </fieldset>;
}

function Form({ brand, requisitionId, loaded }) {
  const router = useRouter();
  const api = `/api/purchase/${brand}`;
  const root = `/${brand}/purchase`;
  const original = loaded?.document;
  const [doc, setDoc] = useState(() => ({
    purpose: original?.purpose || "", reason: original?.reason || "", needed_on: original?.needed_on || "", notes: original?.notes || "",
    shipping: String(original?.shipping ?? 0), discount: String(original?.discount ?? 0), vat: String(original?.vat ?? 0),
    proposer_email: loaded?.viewer.email || "",
  }));
  // The form is initialized only once the authenticated list/detail response is available.
  const [items, setItems] = useState(() => loaded?.items?.length ? loaded.items : [emptyItem()]);
  const [draft, setDraft] = useState(() => ({ id: requisitionId || crypto.randomUUID(), version: original?.version }));
  const [photos, setPhotos] = useState({});
  const [quotes, setQuotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setDoc((previous) => ({ ...previous, [key]: value }));
  const line = (id, key, value) => setItems((previous) => previous.map((item) => item.id === id ? { ...item, [key]: value } : item));
  const subtotal = items.reduce((sum, item) => sum + lineMinor(item.quantity, item.unit_price), 0n);
  const total = subtotal + (minor(doc.shipping) || 0n) - (minor(doc.discount) || 0n) + (minor(doc.vat) || 0n);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const target = draft.version ? `${api}/${draft.id}/edit` : api;
      let saved = await post(target, { ...doc, items, id: draft.id, version: draft.version });
      setDraft(saved);
      for (const item of items) {
        if (!photos[item.id]) continue;
        const uploaded = await uploadFile(api, saved.id, photos[item.id], "product", saved.version, item.id);
        saved = { ...saved, version: uploaded.version };
        setDraft(saved);
        setPhotos((previous) => ({ ...previous, [item.id]: null }));
      }
      for (const file of quotes) {
        const uploaded = await uploadFile(api, saved.id, file, "quotation", saved.version);
        saved = { ...saved, version: uploaded.version };
        setDraft(saved);
        setQuotes((previous) => previous.filter((quote) => quote !== file));
      }
      router.push(`${root}/${saved.id}`);
    } catch (error) {
      setError(error.message + (draft.version ? "" : " หากบันทึกเอกสารแล้ว สามารถกลับไปเปิดจากหน้ารายการได้"));
    } finally {
      setBusy(false);
    }
  }

  return <form className="space-y-5" onSubmit={save}>
    <Heading title={original ? "แก้ไขใบตั้งเบิก" : "สร้างใบตั้งเบิก"} subtitle={getBrandTheme(brand).name}>
      <Link className={button} href={original ? `${root}/${original.id}` : root}>กลับหน้ารายการ</Link>
    </Heading>
    <ErrorBox message={error} />
    <fieldset disabled={busy} className="space-y-5">
      <section className={panel + " space-y-4"}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <h2 className="text-lg font-semibold">ข้อมูลเอกสาร</h2>
          <span>{original?.number || "ออกเลขที่เมื่อบันทึก"} · {thaiDate(original?.created_at || bangkokToday())}</span>
        </div>
        {loaded?.viewer?.name && <p className="text-sm">ผู้เสนอ {original?.proposer || loaded.viewer.name}</p>}
        {!loaded?.viewer.email && <Field label="อีเมลผู้เสนอ"><input className={input} type="email" required maxLength={254}
          value={doc.proposer_email} onChange={(event) => set("proposer_email", event.target.value)} /></Field>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="วัตถุประสงค์การจัดซื้อ"><input className={input} value={doc.purpose} required maxLength={250}
            onChange={(event) => set("purpose", event.target.value)} /></Field>
          <DateField label="วันที่ต้องการใช้งาน" value={doc.needed_on} onChange={(value) => set("needed_on", value)} />
          <Field label="เหตุผลความจำเป็น"><textarea className={input} rows={3} value={doc.reason} required maxLength={2500}
            onChange={(event) => set("reason", event.target.value)} /></Field>
          <Field label="หมายเหตุ"><textarea className={input} rows={3} value={doc.notes} maxLength={2500}
            onChange={(event) => set("notes", event.target.value)} /></Field>
        </div>
      </section>
      <section className={panel + " space-y-4"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">รายการสินค้า</h2>
          <button type="button" className={button} disabled={items.length >= 60} onClick={() => setItems((previous) => [...previous, emptyItem()])}>+ เพิ่มสินค้า</button>
        </div>
        {items.map((item, index) => <ItemRow key={item.id} item={item} index={index}
          write={(key, value) => line(item.id, key, value)} drop={() => setItems((previous) => previous.filter((entry) => entry.id !== item.id))}
          onFile={(file) => setPhotos((previous) => ({ ...previous, [item.id]: file }))}
          picture={loaded?.files?.some((file) => file.item_id === item.id)} canDrop={items.length > 1} />)}
        <Field label="แนบใบเสนอราคา (PDF หรือรูปภาพ สูงสุดไฟล์ละ 3 MB)">
          <input className={input} type="file" accept={images + ",application/pdf"} multiple
            onChange={(event) => setQuotes(Array.from(event.target.files))} />
        </Field>
        {quotes.length > 0 && <p className="text-sm text-zinc-600">รอแนบใบเสนอราคา {quotes.length} ไฟล์</p>}
      </section>
      <section className={panel + " space-y-4"}>
        <h2 className="text-lg font-semibold">สรุปยอดเงิน</h2>
        <p className="text-sm">รวมราคาสินค้า ฿{moneyText(subtotal)}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {moneyFields.map(([key, label]) => <Field label={label} key={key}><input className={input} inputMode="decimal"
            value={doc[key]} maxLength={12} required onChange={(event) => set(key, event.target.value)} /></Field>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-3 font-bold">
          <span>ยอดขออนุมัติสุทธิ ฿{moneyText(total)}</span>
          <button className={primary} type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกใบตั้งเบิก"}</button>
        </div>
      </section>
    </fieldset>
  </form>;
}

export default function PurchaseForm({ brand, requisitionId }) {
  const { data, error } = usePurchaseData(`/api/purchase/${brand}${requisitionId ? "/" + requisitionId : ""}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <p role="status">กำลังโหลดแบบฟอร์ม…</p>;
  if (!data.access.write || (data.document && !["draft", "returned"].includes(data.document.status))) {
    return <ErrorBox message="เอกสารนี้ไม่สามารถแก้ไขได้" />;
  }
  return <Form brand={brand} requisitionId={requisitionId} loaded={data} />;
}
