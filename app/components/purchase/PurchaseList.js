"use client";

import Link from "next/link";
import { useState } from "react";
import { getBrandTheme } from "@/app/lib/brandThemes";
import { money, statuses, thaiDate } from "@/lib/purchase/data";
import { button, DateField, ErrorBox, Field, Heading, input, panel, primary, Status, usePurchaseData } from "./ui";

const defaults = { q: "", status: "", from: "", to: "", sort: "created_at", order: "desc" };
const listStatuses = Object.keys(statuses).filter((status) => !["queued", "accepted"].includes(status));

export default function PurchaseList({ brand }) {
  const [filters, setFilters] = useState(defaults);
  const [active, setActive] = useState(defaults);
  const [page, setPage] = useState(1);
  const root = `/${brand}/purchase`;
  const query = new URLSearchParams({ ...active, page: String(page) });
  const { data, error } = usePurchaseData(`/api/purchase/${brand}?${query}`);
  const theme = getBrandTheme(brand);
  const update = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
  const pages = Math.max(1, Math.ceil((data?.count || 0) / 20));

  return <div className="space-y-5">
    <Heading title="จัดซื้อและตั้งเบิก" subtitle={theme.name}>
      {data?.access.manage && <Link className={button} href={root + "/approvers"}>ตั้งค่าผู้อนุมัติ</Link>}
      {data?.access.write && <Link className={primary} href={root + "/new"}>+ สร้างใบตั้งเบิก</Link>}
    </Heading>
    <form className={panel + " space-y-4"} onSubmit={(event) => { event.preventDefault(); setPage(1); setActive(filters); }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="ค้นหาเอกสาร"><input className={input} value={filters.q} maxLength={150}
          placeholder="เลขที่เอกสาร ผู้เสนอ วัตถุประสงค์" onChange={(event) => update("q", event.target.value)} /></Field>
        <Field label="สถานะ"><select className={input} value={filters.status} onChange={(event) => update("status", event.target.value)}>
          <option value="">ทุกสถานะ</option>
          {listStatuses.map((status) => <option key={status} value={status}>{statuses[status]}</option>)}
        </select></Field>
        <DateField label="วันที่เริ่ม" value={filters.from} onChange={(value) => update("from", value)} />
        <DateField label="วันที่สิ้นสุด" value={filters.to} onChange={(value) => update("to", value)} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="เรียงตาม"><select className={input} value={filters.sort} onChange={(event) => update("sort", event.target.value)}>
          <option value="created_at">วันที่สร้าง</option><option value="number">เลขที่เอกสาร</option><option value="total">ยอดเงิน</option>
        </select></Field>
        <Field label="ลำดับ"><select className={input} value={filters.order} onChange={(event) => update("order", event.target.value)}>
          <option value="desc">มากไปน้อย</option><option value="asc">น้อยไปมาก</option>
        </select></Field>
        <button className={primary}>ค้นหา</button>
        <button className={button} type="button" onClick={() => { setFilters(defaults); setActive(defaults); setPage(1); }}>ล้างตัวกรอง</button>
      </div>
    </form>
    <ErrorBox message={error} />
    {!data && !error && <p role="status">กำลังโหลดเอกสาร…</p>}
    {data && <section className={panel + " space-y-3"} aria-label="รายการใบตั้งเบิก">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>พบ {data.count} เอกสาร</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-900">รออนุมัติ {data.pending} เอกสาร</span>
      </div>
      {!data.items.length && <p className="py-5 text-center text-zinc-500">ไม่พบเอกสารตามตัวกรอง</p>}
      {data.items.length > 0 && <>
        <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 lg:block">
          <table className="w-full text-left text-sm">
            <thead style={{ background: theme.tableHeaderBg, color: theme.tableHeaderText }}><tr>
              {["เลขที่เอกสาร", "วันที่สร้าง", "ผู้เสนอ", "วัตถุประสงค์", "ยอดขออนุมัติ", "สถานะ", "ผู้อนุมัติปัจจุบัน", "อัปเดตล่าสุด"]
                .map((label) => <th className="px-3 py-3" scope="col" key={label}>{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {data.items.map((row) => <tr key={row.id}>
                <td className="whitespace-nowrap px-3 py-3"><Link className="font-semibold underline underline-offset-2" href={`${root}/${row.id}`}>{row.number}</Link></td>
                <td className="px-3 py-3">{thaiDate(row.created_at)}</td><td className="px-3 py-3">{row.proposer}</td>
                <td className="max-w-64 break-words px-3 py-3">{row.purpose}</td><td className="px-3 py-3">฿{money(row.total)}</td>
                <td className="px-3 py-3"><Status value={row.status} /></td><td className="px-3 py-3">{row.current_approver || "—"}</td>
                <td className="px-3 py-3">{thaiDate(row.updated_at, true)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <ul className="space-y-3 lg:hidden">
          {data.items.map((row) => <li key={row.id} className="space-y-2 rounded-xl border border-zinc-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link className="font-semibold underline underline-offset-2" href={`${root}/${row.id}`}>{row.number}</Link>
              <Status value={row.status} />
            </div>
            <p className="break-words">{row.purpose}</p>
            <p>{row.proposer} · ฿{money(row.total)}</p>
            <p className="text-zinc-500">สร้าง {thaiDate(row.created_at)} · อัปเดต {thaiDate(row.updated_at, true)}</p>
            {row.current_approver && <p>ผู้อนุมัติปัจจุบัน {row.current_approver}</p>}
          </li>)}
        </ul>
      </>}
      {(pages > 1 || page > 1) && <nav aria-label="หน้ารายการ" className="flex flex-wrap items-center justify-end gap-2">
        <button className={button} disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
        <span className="px-2 text-sm">หน้า {page} / {pages}</span>
        <button className={button} disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
      </nav>}
    </section>}
  </div>;
}
