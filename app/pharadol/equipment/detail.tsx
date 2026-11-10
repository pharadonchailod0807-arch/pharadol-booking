"use client";
import { ImageGallery } from "./images";
import { useState } from "react";
import type {
  Activity,
  Checkout,
  DetailResponse,
  Equipment,
  Maintenance,
  Permissions,
} from "@/lib/equipment/types";
import { Button, Empty, Pager, Status, dateText, money } from "./ui";
import { FileForm } from "./forms";
export function ActivityList({ rows }: { rows: Activity[] }) {
  return rows.length ? (
    <ol className="divide-y divide-[#DDE5DC]">
      {rows.map((a) => (
        <li key={a.id} className="py-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <b>
              {(
                {
                  create: "เพิ่มอุปกรณ์",
                  update: "แก้ไขอุปกรณ์",
                  checkout: "เบิกอุปกรณ์",
                  return: "คืนอุปกรณ์",
                  maintenance_create: "ส่งซ่อม",
                  maintenance_update: "ยืนยันผลการซ่อม",
                  archive: "จัดเก็บ",
                  restore: "กู้คืน",
                  stock_adjust: "เปลี่ยนสถานะ",
                  document_add: "เพิ่มเอกสาร",
                  images_save: "จัดการรูปภาพอุปกรณ์",
                  category_save: "จัดการหมวดหมู่",
                } as Record<string, string>
              )[a.action] || a.action}
            </b>
            <time className="text-xs text-[#66756D]">
              {new Date(a.created_at).toLocaleString("th-TH", {
                timeZone: "Asia/Bangkok",
              })}
            </time>
          </div>
          <p className="mt-1 break-all text-xs text-[#66756D]">
            {a.actor} · {a.equipment_id || "หมวดหมู่"}
          </p>
          <details className="mt-2 text-xs text-[#66756D]">
            <summary className="cursor-pointer">
              ดูค่าก่อนและหลังเปลี่ยนแปลง
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[#F6F7F3] p-3">
                ก่อน: {JSON.stringify(a.previous_value, null, 2)}
              </pre>
              <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[#F6F7F3] p-3">
                หลัง: {JSON.stringify(a.new_value, null, 2)}
              </pre>
            </div>
          </details>
        </li>
      ))}
    </ol>
  ) : (
    <Empty>ยังไม่มีประวัติการเปลี่ยนแปลง</Empty>
  );
}
export function CheckoutList({
  rows,
  canWrite,
  onReturn,
}: {
  rows: Checkout[];
  canWrite: boolean;
  onReturn: (c: Checkout) => void;
}) {
  return rows.length ? (
    <div className="divide-y divide-[#DDE5DC]">
      {rows.map((c) => {
        const remaining = c.items.reduce(
            (n, i) => n + i.quantity - i.returned_quantity,
            0,
          ),
          overdue =
            remaining > 0 &&
            c.expected_return_date <
              new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Bangkok",
              }).format(new Date());
        return (
          <article key={c.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {c.checkout_code}{" "}
                  <span className="font-normal">· {c.borrower}</span>
                </h3>
                <p className="mt-1 text-xs text-[#66756D]">
                  เบิก {dateText(c.checkout_date)} · กำหนดคืน{" "}
                  {dateText(c.expected_return_date)}
                  {c.related_booking ? ` · ใบจอง ${c.related_booking}` : ""}
                </p>
                <p className="mt-1 text-xs text-[#66756D]">
                  ผู้ทำรายการ {c.created_by}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${remaining ? (overdue ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800") : "bg-green-50 text-green-800"}`}
              >
                {remaining
                  ? `ค้างคืน ${remaining} ชิ้น${overdue ? " · เลยกำหนด" : ""}`
                  : "คืนครบแล้ว"}
              </span>
            </div>
            <ul className="my-3 grid gap-2">
              {c.items.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between gap-3 rounded-lg bg-[#F6F7F3] px-3 py-2 text-sm"
                >
                  <span>
                    {i.equipment?.name}{" "}
                    <small className="text-[#66756D]">
                      {i.equipment?.equipment_code}
                    </small>
                  </span>
                  <span className="shrink-0 text-xs">
                    คืน {i.returned_quantity} / {i.quantity}
                  </span>
                </li>
              ))}
            </ul>
            {c.notes && (
              <p className="mb-3 whitespace-pre-wrap break-words text-sm text-[#66756D]">
                {c.notes}
              </p>
            )}
            {canWrite && remaining > 0 && (
              <Button onClick={() => onReturn(c)}>รับคืน / คืนบางส่วน</Button>
            )}
          </article>
        );
      })}
    </div>
  ) : (
    <Empty>ยังไม่มีรายการเบิกอุปกรณ์</Empty>
  );
}
export function MaintenanceList({
  rows,
  admin,
  onEdit,
  onDocuments,
}: {
  rows: Maintenance[];
  admin: boolean;
  onEdit: (m: Maintenance) => void;
  onDocuments?: (m: Maintenance) => void;
}) {
  return rows.length ? (
    <div className="divide-y divide-[#DDE5DC]">
      {rows.map((m) => (
        <article key={m.id} className="p-4 sm:p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {m.maintenance_code} ·{" "}
                {m.equipment?.name || `${m.quantity} ชิ้น`}
              </h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                {m.issue}
              </p>
              <p className="mt-2 text-xs text-[#66756D]">
                แจ้ง {dateText(m.reported_date)} · เริ่มซ่อม{" "}
                {dateText(m.start_date)} · เสร็จ {dateText(m.completion_date)}
              </p>
              <p className="mt-1 text-xs text-[#66756D]">
                {m.service_provider || "ยังไม่ระบุผู้ให้บริการ"} · ค่าใช้จ่าย{" "}
                {money(m.cost)}
                {m.confirmed_by ? ` · ตรวจรับโดย ${m.confirmed_by}` : ""}
              </p>
              {m.notes && (
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#66756D]">
                  {m.notes}
                </p>
              )}
            </div>
            <Status status={m.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {admin && !["completed", "cancelled"].includes(m.status) && (
              <Button onClick={() => onEdit(m)}>
                อัปเดต / ยืนยันซ่อมเสร็จ
              </Button>
            )}
            {onDocuments && (
              <Button onClick={() => onDocuments(m)}>เอกสารการซ่อม</Button>
            )}
          </div>
        </article>
      ))}
    </div>
  ) : (
    <Empty>ยังไม่มีประวัติซ่อมบำรุง</Empty>
  );
}
export default function Detail({
  data,
  permissions,
  page,
  setPage,
  reload,
  onEdit,
  onStock,
  onReturn,
  onMaintenance,
  onMaintenanceEdit,
  onMaintenanceDocuments,
}: {
  data: DetailResponse;
  permissions: Permissions;
  page: number;
  setPage: (p: number) => void;
  reload: () => Promise<void>;
  onEdit: (e: Equipment) => void;
  onStock: (e: Equipment) => void;
  onReturn: (c: Checkout) => void;
  onMaintenance: (e: Equipment) => void;
  onMaintenanceEdit: (m: Maintenance) => void;
  onMaintenanceDocuments: (m: Maintenance) => void;
}) {
  const [tab, setTab] = useState("overview"),
    e = data.equipment,
    images = data.images;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#66756D]">
            {e.equipment_code} · {e.category_name}
          </p>
          <h3 className="mt-1 text-2xl font-semibold">{e.name}</h3>
        </div>
        <Status status={e.status} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {[
          ["overview", "Overview"],
          ["checkout", "Checkout History"],
          ["maintenance", "Maintenance History"],
          ["documents", "Documents"],
          ["activity", "Activity Log"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
            aria-pressed={tab === id}
            className={`min-h-11 rounded-xl px-3 py-2 text-xs font-medium ${tab === id ? "bg-[#183024] text-white" : "bg-[#F6F7F3] text-[#66756D]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <div className="space-y-3">
            <ImageGallery images={images} name={e.name} />
            <div className="rounded-xl bg-[#F6F7F3] p-4 text-xs text-[#66756D]">
              ค่าซ่อมสะสม
              <p className="mt-1 text-xl font-semibold text-[#10231C]">
                {money(data.maintenanceExpenses)}
              </p>
            </div>
          </div>
          <div className="sm:col-span-2">
            <dl className="grid grid-cols-2 gap-4">
              {[
                ["ยี่ห้อ", e.manufacturer],
                ["รุ่น", e.model],
                ["Serial Number", e.serial_number],
                ["จำนวนทั้งหมด", `${e.quantity} ${e.unit}`],
                ["พร้อมใช้งาน", e.available],
                ["กำลังใช้งาน", e.in_use],
                ["ส่งซ่อม", e.maintenance],
                ["ชำรุด", e.damaged],
                ["ปลดระวาง", e.retired],
                ["สถานที่จัดเก็บ", e.storage_location],
                ["ราคาซื้อต่อหน่วย", money(e.purchase_price)],
                ["มูลค่าซื้อรวม", money(e.purchase_price * e.quantity)],
                ["วันที่ซื้อ", dateText(e.purchase_date)],
                ["หมดประกัน", dateText(e.warranty_expiration)],
                ["ผู้จำหน่าย", e.supplier],
                ["สถานะจัดเก็บ", e.archived_at ? "Archived" : "ใช้งานอยู่"],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0">
                  <dt className="text-xs text-[#66756D]">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium">
                    {value === 0 ? "0" : value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 rounded-xl border border-[#DDE5DC] p-4 text-sm">
              <p className="mb-1 text-xs text-[#66756D]">
                รายละเอียด / หมายเหตุ
              </p>
              <p className="whitespace-pre-wrap break-words">
                {e.description || "—"}
              </p>
            </div>
            {!e.archived_at && (
              <div className="mt-5 flex flex-wrap gap-2">
                {permissions.write && (
                  <>
                    <Button onClick={() => onEdit(e)}>แก้ไขข้อมูล</Button>
                    <Button onClick={() => onMaintenance(e)}>ส่งซ่อม</Button>
                  </>
                )}
                {permissions.admin && (
                  <Button onClick={() => onStock(e)}>
                    เปลี่ยนสถานะ / ปลดระวาง
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "checkout" && (
        <div className="mt-4">
          <CheckoutList
            rows={data.checkouts}
            canWrite={permissions.write}
            onReturn={onReturn}
          />

          <h4 className="mt-5 font-semibold">
            ประวัติรับคืนทั้งหมดของอุปกรณ์นี้
          </h4>
          {data.returns.length ? (
            <ul className="mt-3 divide-y divide-[#DDE5DC]">
              {data.returns.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  {r.checkout_code} · {dateText(r.return_date)} · {r.quantity}{" "}
                  ชิ้น · {statusLabelsLocal(r.condition)}
                  <p className="mt-1 text-xs text-[#66756D]">
                    {r.created_by} · {r.notes || "ไม่มีหมายเหตุ"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[#66756D]">ยังไม่มีการรับคืน</p>
          )}
          <Pager
            page={page}
            total={Math.max(data.historyTotal, data.returnsTotal)}
            onChange={setPage}
          />
        </div>
      )}
      {tab === "maintenance" && (
        <div className="mt-4">
          <MaintenanceList
            rows={data.maintenance}
            admin={permissions.admin}
            onEdit={onMaintenanceEdit}
            onDocuments={onMaintenanceDocuments}
          />
          <Pager page={page} total={data.maintenanceTotal} onChange={setPage} />
        </div>
      )}
      {tab === "documents" && (
        <div className="mt-5 space-y-4">
          {permissions.write && (
            <FileForm equipmentId={e.id} onUploaded={reload} />
          )}
          <p className="text-xs text-[#66756D]">
            ไฟล์ทั้งหมดเป็นส่วนตัว ต้องเข้าสู่ระบบและมีสิทธิ์ Pharadol
            เพื่อดาวน์โหลด
          </p>
          {data.documents.length ? (
            <ul className="divide-y divide-[#DDE5DC]">
              {data.documents.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">
                      {d.filename}
                    </p>
                    <p className="text-xs text-[#66756D]">
                      {d.kind} · {Math.ceil(d.size / 1024)} KB ·{" "}
                      {dateText(d.created_at)}
                    </p>
                  </div>
                  <a
                    className="rounded-xl border border-[#DDE5DC] px-4 py-3 text-xs"
                    href={`/api/equipment/files?id=${d.id}`}
                  >
                    ดาวน์โหลด
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>ยังไม่มีเอกสารแนบ</Empty>
          )}
        </div>
      )}
      {tab === "documents" && (
        <Pager page={page} total={data.documentsTotal} onChange={setPage} />
      )}
      {tab === "activity" && (
        <div className="mt-4">
          <ActivityList rows={data.activity} />
          <Pager page={page} total={data.activityTotal} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
function statusLabelsLocal(s: string) {
  return (
    (
      { available: "ปกติ", damaged: "ชำรุด", maintenance: "ส่งซ่อม" } as Record<
        string,
        string
      >
    )[s] || s
  );
}
