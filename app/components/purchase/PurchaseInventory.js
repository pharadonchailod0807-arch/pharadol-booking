"use client";

import { useState } from "react";
import Link from "next/link";
import { button, ErrorBox, Field, input, panel, post, primary, request, usePurchaseData } from "./ui";

const empty = { selected: false, equipment_id: "", serial_number: "", category_id: "", unit_price: "" };

function InventoryRow({ item, row, set, options, matches, link, findSerial, busy }) {
  return <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-3" disabled={busy}>
    <label className="flex flex-wrap items-center gap-2 font-medium">
      <input type="checkbox" checked={Boolean(link || row.selected)} disabled={Boolean(link)} onChange={(event) => set("selected", event.target.checked)} />
      {item.name} · {item.quantity} {item.unit}
    </label>
    {link ? <p className="text-sm text-emerald-800">เชื่อมกับ {link.code} แล้ว</p> : row.selected && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><Field label="Serial Number (ถ้ามี)"><input className={input} value={row.serial_number}
            maxLength={160} onChange={(event) => set("serial_number", event.target.value)} /></Field></div>
          <button type="button" className={button} onClick={findSerial} disabled={!row.serial_number.trim()}>ค้นหา</button>
        </div>
        <Field label="รายการเดิมในคลัง"><select className={input} value={row.equipment_id} onChange={(event) => set("equipment_id", event.target.value)}>
          <option value="">สร้างอุปกรณ์ใหม่</option>
          {matches.map((match) => <option key={match.id} value={match.id} disabled={match.archived}>
            {match.code} · {match.name}{match.serial ? " · " + match.serial : ""}{match.archived ? " (เก็บถาวร)" : ""}
          </option>)}
        </select></Field>
        {!row.equipment_id && <>
          <Field label="หมวดหมู่"><select className={input} value={row.category_id} required onChange={(event) => set("category_id", event.target.value)}>
            <option value="">เลือกหมวดหมู่</option>
            {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></Field>
          <Field label="ราคาซื้อจริงต่อหน่วย"><input className={input} inputMode="decimal" value={row.unit_price} required
            onChange={(event) => set("unit_price", event.target.value)} /></Field>
        </>}
      </div>
      {matches.length > 0 && <p className="text-sm text-amber-900">พบ {matches.length} รายการที่ตรงกับชื่อหรือ Serial Number</p>}
    </>}
  </fieldset>;
}

export default function PurchaseInventory({ api, items }) {
  const { data, error, refresh } = usePurchaseData(api);
  const [values, setValues] = useState({});
  const [serialMatches, setSerialMatches] = useState({});
  const [lookup, setLookup] = useState({});
  const [issues, setIssues] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (id, key, value) => setValues((previous) => ({
    ...previous, [id]: { ...(previous[id] || empty), [key]: value, ...(key === "serial_number" ? { equipment_id: "" } : {}) },
  }));
  async function findSerial(itemId) {
    const serial = values[itemId].serial_number;
    setIssues("");
    try {
      const found = await request(api + "?" + new URLSearchParams({ serial }));
      setSerialMatches((previous) => ({ ...previous, [itemId]: found.matches.filter((match) => match.item_id === itemId) }));
      setLookup((previous) => ({ ...previous, [itemId]: serial }));
    } catch (error) {
      setIssues(error.message);
    }
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setIssues("");
    try {
      const selected = Object.entries(values)
        .filter(([id, row]) => row.selected && !data.links.some((link) => link.item_id === id))
        .map(([id, row]) => ({ ...row, item_id: id }));
      await post(api, { items: selected });
      setValues({});
      refresh();
    } catch (error) {
      setIssues(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <form className={panel + " space-y-4"} onSubmit={save}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">เพิ่มเข้าคลังอุปกรณ์</h2>
      <Link className={button} href="/pharadol/equipment">เปิดคลังอุปกรณ์</Link>
    </div>
    <ErrorBox message={error || issues} />
    {!data && !error && <p role="status">กำลังตรวจสอบคลัง…</p>}
    {data && <>
      <p className="text-sm text-zinc-600">เลือกรายการที่จะสร้างในคลังหรือเชื่อมกับอุปกรณ์เดิม การเชื่อมจะบันทึกเลขใบตั้งเบิกไว้ในประวัติ</p>
      {items.map((item) => {
        const row = values[item.id] || empty;
        const matches = row.serial_number && lookup[item.id] === row.serial_number
          ? serialMatches[item.id] : data.matches.filter((match) => match.item_id === item.id);
        return <InventoryRow key={item.id} item={item} row={row} busy={busy} options={data} matches={matches}
          set={(key, value) => set(item.id, key, value)} link={data.links.find((link) => link.item_id === item.id)}
          findSerial={() => findSerial(item.id)} />;
      })}
      <button className={primary} disabled={busy || !Object.values(values).some((row) => row.selected)}>บันทึกรายการเข้าคลัง</button>
    </>}
  </form>;
}
