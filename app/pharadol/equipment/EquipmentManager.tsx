"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Category,
  Checkout,
  DetailResponse,
  Equipment,
  InventoryResponse,
  Maintenance,
  Permissions,
  Activity,
} from "@/lib/equipment/types";
import {
  Button,
  Empty,
  Field,
  Modal,
  Pager,
  Select,
  Status,
  api,
  money,
  statuses,
  statusLabels,
} from "./ui";
import {
  CategoryForm,
  CheckoutForm,
  EquipmentForm,
  FileForm,
  MaintenanceForm,
  ReturnForm,
  StockForm,
} from "./forms";
import Detail, { ActivityList, CheckoutList, MaintenanceList } from "./detail";
type View =
  | "inventory"
  | "checkouts"
  | "maintenance"
  | "categories"
  | "activity"
  | "archive";
type FormState =
  | { type: "add" }
  | { type: "edit"; equipment: Equipment }
  | { type: "checkout" }
  | { type: "return"; checkout: Checkout }
  | { type: "maintenance"; equipment?: Equipment }
  | { type: "maintenance_edit"; maintenance: Maintenance }
  | { type: "maintenance_documents"; maintenance: Maintenance }
  | { type: "category"; category?: Category }
  | { type: "archive" | "restore" | "stock"; equipment: Equipment };
const card = "min-w-0 rounded-2xl border border-[#DDE5DC] bg-white";
export default function EquipmentManager({
  permissions: initialPermissions,
}: {
  permissions: Permissions;
}) {
  const [view, setView] = useState<View>("inventory"),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("code"),
    [direction, setDirection] = useState("asc"),
    [page, setPage] = useState(1);
  const [inventory, setInventory] = useState<InventoryResponse | null>(null),
    [checkouts, setCheckouts] = useState<Checkout[]>([]),
    [maintenance, setMaintenance] = useState<Maintenance[]>([]),
    [activity, setActivity] = useState<Activity[]>([]),
    [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [form, setForm] = useState<FormState | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [exportBusy, setExportBusy] = useState(false);
  const [detailId, setDetailId] = useState(""),
    [detail, setDetail] = useState<DetailResponse | null>(null),
    [detailPage, setDetailPage] = useState(1),
    [detailError, setDetailError] = useState(""),
    [detailLoading, setDetailLoading] = useState(false);
  const requestRef = useRef<{ key: string; id: string } | null>(null),
    loadRef = useRef(0);
  const permissions = inventory?.permissions || initialPermissions;
  const params = new URLSearchParams({
    search: debounced,
    category,
    status,
    sort,
    direction,
    page: String(page),
    archived: view === "archive" ? "1" : "0",
  }).toString();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    const focus = () => {
      if (active) refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController(),
      generation = ++loadRef.current;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const inv = await api<InventoryResponse>(`/api/equipment?${params}`, {
          signal: controller.signal,
        });
        if (generation !== loadRef.current) return;
        setInventory(inv);
        if (["checkouts", "maintenance", "activity"].includes(view)) {
          const result = await api<{
            checkouts?: Checkout[];
            maintenance?: Maintenance[];
            activity?: Activity[];
            total: number;
          }>(`/api/equipment?mode=${view}&page=${page}`, {
            signal: controller.signal,
          });
          if (generation !== loadRef.current) return;
          setCheckouts(result.checkouts || []);
          setMaintenance(result.maintenance || []);
          setActivity(result.activity || []);
          setTotal(result.total);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (generation === loadRef.current) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [params, page, view, revision]);
  const reloadDetail = useCallback(async () => {
    if (!detailId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const d = await api<DetailResponse>(
        `/api/equipment?mode=detail&id=${detailId}&page=${detailPage}`,
      );
      setDetail(d);
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, [detailId, detailPage]);
  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    void api<DetailResponse>(
      `/api/equipment?mode=detail&id=${detailId}&page=${detailPage}`,
      { signal: controller.signal },
    )
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted) setDetailError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [detailId, detailPage, revision]);
  function openForm(f: FormState) {
    setFormError("");
    requestRef.current = null;
    setForm(f);
  }
  function openDetail(e: Equipment) {
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setDetailPage(1);
    setDetailId(e.id);
  }
  async function submit(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setFormError("");
    const key = JSON.stringify({ action, payload });
    if (requestRef.current?.key !== key)
      requestRef.current = { key, id: crypto.randomUUID() };
    try {
      await api("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          payload,
          requestId: requestRef.current.id,
        }),
      });
      setForm(null);
      requestRef.current = null;
      setNotice("บันทึกข้อมูลเรียบร้อยแล้ว");
      refresh();
      if (detailId) await reloadDetail();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(format: string) {
    setExportBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/equipment/export?${params}&format=${format}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const b = await r.json();
        throw new Error(b.error);
      }
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `pharadol-equipment.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  }
  const summary = inventory?.summary;
  const stats = [
    ["Total Equipment", "จำนวนอุปกรณ์ทั้งหมด", summary?.quantity, "ชิ้น"],
    ["Available", "พร้อมใช้งาน", summary?.available, "ชิ้น"],
    ["In Use", "กำลังใช้งาน", summary?.in_use, "ชิ้น"],
    ["Maintenance", "อยู่ระหว่างซ่อม", summary?.maintenance, "ชิ้น"],
    ["Damaged", "ชำรุด", summary?.damaged, "ชิ้น"],
    ["Total Asset Value", "มูลค่าซื้อรวม", summary?.purchase_value, "บาท"],
  ];
  const formTitle = form
    ? (
        {
          add: "Add Equipment · เพิ่มอุปกรณ์",
          edit: "Edit Equipment · แก้ไขอุปกรณ์",
          checkout: "Checkout · เบิกอุปกรณ์",
          return: "Return · รับคืนอุปกรณ์",
          maintenance: "Maintenance · ส่งซ่อม",
          maintenance_edit: "ตรวจรับและอัปเดตการซ่อม",
          maintenance_documents: "เอกสารการซ่อม",
          category: "จัดการหมวดหมู่",
          archive: "ยืนยัน Archive",
          restore: "ยืนยัน Restore",
          stock: "เปลี่ยนสถานะอุปกรณ์",
        } as Record<string, string>
      )[form.type]
    : "";
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 text-[#10231C] sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[.22em] text-[#66756D]">
            PHARADOL PRODUCTION
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Equipment
          </h1>
          <p className="mt-2 text-sm text-[#66756D]">
            คลังอุปกรณ์ · จัดการทรัพย์สิน การเบิก–คืน และการดูแลรักษา
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={refresh} disabled={loading}>
            ↻ อัปเดต
          </Button>
          {permissions.write && (
            <>
              <Button onClick={() => openForm({ type: "checkout" })}>
                เบิกอุปกรณ์
              </Button>
              <Button primary onClick={() => openForm({ type: "add" })}>
                + Add Equipment
              </Button>
            </>
          )}
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map(([title, label, value, unit], i) => (
          <section key={String(title)} className={`${card} p-4 sm:p-5`}>
            <p className="text-xs font-medium text-[#66756D]">{title}</p>
            <p className="mt-1 text-[10px] text-[#66756D]">{label}</p>
            <p
              className="mt-4 break-words text-2xl font-semibold tracking-tight"
              aria-busy={!summary}
            >
              {value === undefined
                ? "—"
                : i === 5
                  ? money(value)
                  : Number(value).toLocaleString()}
              <span className="ml-1 text-[10px] font-normal text-[#66756D]">
                {i !== 5 ? unit : ""}
              </span>
            </p>
            <div
              className={`mt-4 h-0.5 w-7 rounded-full ${["bg-[#183024]", "bg-green-600", "bg-blue-500", "bg-amber-500", "bg-red-500", "bg-[#C8A060]"][i]}`}
            />
          </section>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-3 text-xs text-[#66756D]">
        <p>
          มูลค่าซื้อรวม = ราคาต่อหน่วย × จำนวนทั้งหมด · ไม่รวมรายการ Archive ·
          ไม่ใช่มูลค่าประเมินปัจจุบัน
        </p>
        <p>
          ค่าซ่อมสะสมรวม {summary ? money(summary.maintenance_expenses) : "—"} ·
          อัปเดตทุก 30 วินาที
        </p>
      </div>
      <nav
        aria-label="เมนูคลังอุปกรณ์"
        className="flex flex-wrap gap-1 rounded-2xl border border-[#DDE5DC] bg-white p-1.5"
      >
        {(
          [
            ["inventory", "คลังอุปกรณ์"],
            ["checkouts", "เบิก–คืน"],
            ["maintenance", "ซ่อมบำรุง"],
            ["categories", "หมวดหมู่"],
            ["activity", "Activity Log"],
            ["archive", "Archive"],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => {
              setView(id);
              setPage(1);
            }}
            aria-current={view === id ? "page" : undefined}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-medium ${view === id ? "bg-[#183024] text-white" : "text-[#66756D] hover:bg-[#F6F7F3]"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <div
          role="status"
          className="flex justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {notice}
          <button onClick={() => setNotice("")} aria-label="ปิดข้อความ">
            ×
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{error}</p>
          <div className="mt-3">
            <Button onClick={refresh}>ลองใหม่</Button>
          </div>
        </div>
      )}
      <section className={card} aria-busy={loading}>
        {["inventory", "archive"].includes(view) && (
          <>
            <div className="flex flex-wrap items-end gap-3 border-b border-[#DDE5DC] p-4">
              <div className="min-w-[160px] flex-1">
                <Field
                  label="ค้นหาอุปกรณ์"
                  placeholder="ชื่อ รหัส ยี่ห้อ รุ่น หรือ Serial"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-full sm:w-44">
                <Select
                  label="หมวดหมู่"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">ทุกหมวดหมู่</option>
                  {inventory?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-[calc(50%-6px)] sm:w-36">
                <Select
                  label="สถานะ"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">ทุกสถานะ</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-[calc(50%-6px)] sm:w-36">
                <Select
                  label="เรียงตาม"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                >
                  {[
                    ["code", "Equipment ID"],
                    ["name", "ชื่ออุปกรณ์"],
                    ["category", "หมวดหมู่"],
                    ["quantity", "จำนวน"],
                    ["purchase_date", "วันที่ซื้อ"],
                    ["status", "สถานะ"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                onClick={() => {
                  setDirection((d) => (d === "asc" ? "desc" : "asc"));
                  setPage(1);
                }}
              >
                {direction === "asc" ? "↑ น้อยไปมาก" : "↓ มากไปน้อย"}
              </Button>
              <details className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-[#DDE5DC] px-4 text-sm">
                  Export ▾
                </summary>
                <div className="absolute right-0 z-20 mt-2 grid w-44 gap-2 rounded-xl border border-[#DDE5DC] bg-white p-2 shadow-lg">
                  <Button
                    disabled={exportBusy}
                    onClick={() => void download("xlsx")}
                  >
                    Excel (.xlsx)
                  </Button>
                  <Button
                    disabled={exportBusy}
                    onClick={() => void download("pdf")}
                  >
                    PDF ภาษาไทย
                  </Button>
                </div>
              </details>
            </div>
            {loading && !inventory ? (
              <Empty>กำลังโหลดข้อมูลอุปกรณ์…</Empty>
            ) : error && !inventory ? (
              <Empty>ยังไม่สามารถโหลดคลังอุปกรณ์ได้</Empty>
            ) : !inventory?.equipment.length ? (
              <Empty>
                {search || category || status
                  ? "ไม่พบอุปกรณ์ตามเงื่อนไขที่เลือก"
                  : view === "archive"
                    ? "ยังไม่มีอุปกรณ์ใน Archive"
                    : "ยังไม่มีอุปกรณ์ในคลัง เริ่มต้นด้วย Add Equipment"}
              </Empty>
            ) : (
              <>
                <div className="hidden lg:block">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-[#F6F7F3] text-[#66756D]">
                      <tr>
                        <th className="w-[7%] p-3">รูป</th>
                        <th className="w-[25%] p-3">Equipment / Category</th>
                        <th className="w-[12%] p-3">Brand / Model</th>
                        <th className="w-[7%] p-2 text-center">ทั้งหมด</th>
                        <th className="w-[7%] p-2 text-center">พร้อมใช้</th>
                        <th className="w-[14%] p-3">สถานะ</th>
                        <th className="w-[13%] p-3">จัดเก็บ</th>
                        <th className="w-[15%] p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDE5DC]">
                      {inventory.equipment.map((e) => (
                        <tr
                          key={e.id}
                          className="align-middle hover:bg-[#F6F7F3]/60"
                        >
                          <td className="p-3">
                            {e.image_id ? (
                              <Image
                                unoptimized
                                width={48}
                                height={48}
                                src={`/api/equipment/files?id=${e.image_id}&inline=1`}
                                alt=""
                                className="aspect-square w-12 rounded-lg object-cover"
                              />
                            ) : (
                              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#F6F7F3] text-lg text-[#66756D]">
                                ▣
                              </span>
                            )}
                          </td>
                          <td className="break-words p-3">
                            <button
                              onClick={() => openDetail(e)}
                              className="min-h-11 text-left font-semibold hover:underline"
                            >
                              {e.name}
                            </button>
                            <p className="text-[10px] text-[#66756D]">
                              {e.equipment_code} · {e.category_name}
                            </p>
                          </td>
                          <td className="break-words p-3">
                            {e.manufacturer || "—"}
                            <p className="mt-1 text-[#66756D]">{e.model}</p>
                          </td>
                          <td className="p-2 text-center font-semibold">
                            {e.quantity}
                          </td>
                          <td className="p-2 text-center font-semibold text-green-800">
                            {e.available}
                          </td>
                          <td className="p-3">
                            <Status status={e.status} />
                          </td>
                          <td className="break-words p-3 text-[#66756D]">
                            {e.storage_location || "—"}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <button
                                className="min-h-11 px-2 underline"
                                onClick={() => openDetail(e)}
                              >
                                ดู
                              </button>
                              {permissions.write && !e.archived_at && (
                                <button
                                  className="min-h-11 px-2 underline"
                                  onClick={() =>
                                    openForm({ type: "edit", equipment: e })
                                  }
                                >
                                  แก้ไข
                                </button>
                              )}
                              {permissions.admin && (
                                <button
                                  className="min-h-11 px-2 text-red-700 underline"
                                  onClick={() =>
                                    openForm({
                                      type: e.archived_at
                                        ? "restore"
                                        : "archive",
                                      equipment: e,
                                    })
                                  }
                                >
                                  {e.archived_at ? "Restore" : "Archive"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-[#DDE5DC] lg:hidden">
                  {inventory.equipment.map((e) => (
                    <article key={e.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            className="min-h-11 break-words text-left font-semibold"
                            onClick={() => openDetail(e)}
                          >
                            {e.name}
                          </button>
                          <p className="text-xs text-[#66756D]">
                            {e.equipment_code} · {e.category_name}
                          </p>
                          <p className="mt-1 text-xs text-[#66756D]">
                            {e.manufacturer} {e.model}
                          </p>
                        </div>
                        <Status status={e.status} />
                      </div>
                      <p className="my-4 text-sm">
                        ทั้งหมด <b>{e.quantity}</b> · พร้อมใช้{" "}
                        <b className="text-green-800">{e.available}</b> {e.unit}
                      </p>
                      <p className="mb-3 text-xs text-[#66756D]">
                        สถานที่จัดเก็บ: {e.storage_location || "—"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => openDetail(e)}>
                          ดูรายละเอียด
                        </Button>
                        {permissions.write && !e.archived_at && (
                          <Button
                            onClick={() =>
                              openForm({ type: "edit", equipment: e })
                            }
                          >
                            แก้ไข
                          </Button>
                        )}
                        {permissions.admin && (
                          <Button
                            onClick={() =>
                              openForm({
                                type: e.archived_at ? "restore" : "archive",
                                equipment: e,
                              })
                            }
                          >
                            {e.archived_at ? "Restore" : "Archive"}
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {inventory && (
              <Pager page={page} total={inventory.total} onChange={setPage} />
            )}
          </>
        )}
        {view === "checkouts" && (
          <>
            <div className="flex items-center justify-between border-b border-[#DDE5DC] p-4">
              <h2 className="font-semibold">ประวัติการเบิก–คืน</h2>
              {permissions.write && (
                <Button primary onClick={() => openForm({ type: "checkout" })}>
                  + เบิกอุปกรณ์
                </Button>
              )}
            </div>
            {loading ? (
              <Empty>กำลังโหลดรายการเบิก…</Empty>
            ) : (
              <CheckoutList
                rows={checkouts}
                canWrite={permissions.write}
                onReturn={(c) => openForm({ type: "return", checkout: c })}
              />
            )}
            <Pager page={page} total={total} onChange={setPage} />
          </>
        )}
        {view === "maintenance" && (
          <>
            <div className="flex items-center justify-between border-b border-[#DDE5DC] p-4">
              <h2 className="font-semibold">การซ่อมบำรุง</h2>
              {permissions.write && (
                <Button
                  primary
                  onClick={() => openForm({ type: "maintenance" })}
                >
                  + ส่งซ่อม
                </Button>
              )}
            </div>
            {loading ? (
              <Empty>กำลังโหลดประวัติซ่อม…</Empty>
            ) : (
              <MaintenanceList
                rows={maintenance}
                admin={permissions.admin}
                onEdit={(m) =>
                  openForm({ type: "maintenance_edit", maintenance: m })
                }
                onDocuments={(m) =>
                  openForm({ type: "maintenance_documents", maintenance: m })
                }
              />
            )}
            <Pager page={page} total={total} onChange={setPage} />
          </>
        )}
        {view === "categories" && (
          <>
            <div className="flex items-center justify-between border-b border-[#DDE5DC] p-4">
              <h2 className="font-semibold">หมวดหมู่อุปกรณ์</h2>
              {permissions.admin && (
                <Button primary onClick={() => openForm({ type: "category" })}>
                  + เพิ่มหมวดหมู่
                </Button>
              )}
            </div>
            <div className="divide-y divide-[#DDE5DC]">
              {inventory?.categories.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <p className="text-sm">
                    {c.name}{" "}
                    <span
                      className={`ml-2 text-xs ${c.active ? "text-green-700" : "text-gray-500"}`}
                    >
                      {c.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </p>
                  {permissions.admin && (
                    <Button
                      onClick={() =>
                        openForm({ type: "category", category: c })
                      }
                    >
                      แก้ไข
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className="p-4 text-xs text-[#66756D]">
              ปิดใช้งานได้โดยเก็บข้อมูลอุปกรณ์และประวัติเดิมไว้
              ไม่มีการลบหมวดหมู่ถาวร
            </p>
          </>
        )}
        {view === "activity" && (
          <div className="p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Activity Log</h2>
            {loading ? (
              <Empty>กำลังโหลดประวัติ…</Empty>
            ) : (
              <ActivityList rows={activity} />
            )}
            <Pager page={page} total={total} onChange={setPage} />
          </div>
        )}
      </section>
      {detailId && (
        <Modal
          title="Equipment Details"
          wide
          onClose={() => {
            setDetailId("");
            setDetail(null);
          }}
        >
          {detailError && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {detailError}
            </p>
          )}
          {detailLoading && (
            <p role="status" className="mb-3 text-xs text-[#66756D]">
              กำลังอัปเดตรายละเอียด…
            </p>
          )}
          {detail && (
            <Detail
              data={detail}
              permissions={permissions}
              page={detailPage}
              setPage={setDetailPage}
              reload={reloadDetail}
              onEdit={(e) => openForm({ type: "edit", equipment: e })}
              onStock={(e) => openForm({ type: "stock", equipment: e })}
              onReturn={(c) => openForm({ type: "return", checkout: c })}
              onMaintenance={(e) =>
                openForm({ type: "maintenance", equipment: e })
              }
              onMaintenanceEdit={(m) =>
                openForm({ type: "maintenance_edit", maintenance: m })
              }
              onMaintenanceDocuments={(m) =>
                openForm({ type: "maintenance_documents", maintenance: m })
              }
            />
          )}
        </Modal>
      )}
      {form && (
        <Modal title={formTitle} onClose={() => setForm(null)} busy={busy}>
          {formError && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {formError}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0">
            {form.type === "add" && (
              <EquipmentForm
                categories={inventory?.categories || []}
                admin={permissions.admin}
                busy={busy}
                submit={submit}
              />
            )}
            {form.type === "edit" && (
              <EquipmentForm
                equipment={form.equipment}
                categories={inventory?.categories || []}
                admin={permissions.admin}
                busy={busy}
                submit={submit}
              />
            )}
            {form.type === "checkout" && (
              <CheckoutForm busy={busy} submit={submit} />
            )}
            {form.type === "return" && (
              <ReturnForm
                checkout={form.checkout}
                busy={busy}
                submit={submit}
              />
            )}
            {form.type === "maintenance" && (
              <MaintenanceForm
                equipment={form.equipment}
                busy={busy}
                submit={submit}
              />
            )}
            {form.type === "maintenance_edit" && (
              <MaintenanceForm
                maintenance={form.maintenance}
                busy={busy}
                submit={submit}
              />
            )}
            {form.type === "maintenance_documents" && (
              <MaintenanceDocuments
                maintenance={form.maintenance}
                canWrite={permissions.write}
                onUploaded={async () => {
                  refresh();
                  if (detailId) await reloadDetail();
                }}
              />
            )}
            {form.type === "category" && (
              <CategoryForm
                category={form.category}
                busy={busy}
                submit={submit}
              />
            )}
            {form.type === "stock" && (
              <StockForm
                equipment={form.equipment}
                busy={busy}
                submit={submit}
              />
            )}
            {(form.type === "archive" || form.type === "restore") && (
              <div>
                <p className="text-sm">
                  {form.type === "archive" ? "ต้องการจัดเก็บ" : "ต้องการกู้คืน"}{" "}
                  <b>
                    {form.equipment.name} ({form.equipment.equipment_code})
                  </b>{" "}
                  หรือไม่?
                </p>
                <p className="mt-3 text-xs text-[#66756D]">
                  {form.type === "archive"
                    ? "รายการที่ยังค้างเบิกหรืออยู่ระหว่างซ่อมจะไม่สามารถ Archive ได้"
                    : ""}{" "}
                  ประวัติทั้งหมดจะถูกเก็บรักษาไว้
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <Button onClick={() => setForm(null)}>ยกเลิก</Button>
                  <Button
                    primary
                    disabled={busy}
                    onClick={() =>
                      void submit(form.type, { id: form.equipment.id })
                    }
                  >
                    {busy ? "กำลังบันทึก…" : "ยืนยัน"}
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
function MaintenanceDocuments({
  maintenance: m,
  canWrite,
  onUploaded,
}: {
  maintenance: Maintenance;
  canWrite: boolean;
  onUploaded: () => Promise<void>;
}) {
  const [data, setData] = useState<DetailResponse | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1);
  const load = useCallback(async () => {
    try {
      setData(
        await api<DetailResponse>(
          `/api/equipment?mode=detail&id=${m.equipment_id}&maintenance_id=${m.id}&page=${page}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [m.equipment_id, m.id, page]);
  useEffect(() => {
    const controller = new AbortController();
    void api<DetailResponse>(
      `/api/equipment?mode=detail&id=${m.equipment_id}&maintenance_id=${m.id}&page=${page}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [m.equipment_id, m.id, page]);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {m.maintenance_code} · {m.issue}
      </p>
      {canWrite && (
        <FileForm
          equipmentId={m.equipment_id}
          maintenanceId={m.id}
          onUploaded={async () => {
            await load();
            await onUploaded();
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {data?.documents
          .filter((d) => d.maintenance_id === m.id)
          .map((d) => (
            <li key={d.id}>
              <a
                className="break-all text-sm underline"
                href={`/api/equipment/files?id=${d.id}`}
              >
                {d.filename}
              </a>
            </li>
          ))}
      </ul>
      {data && (
        <Pager page={page} total={data.documentsTotal} onChange={setPage} />
      )}
      {data && !data.documents.some((d) => d.maintenance_id === m.id) && (
        <Empty>ยังไม่มีเอกสารการซ่อม</Empty>
      )}
    </div>
  );
}
