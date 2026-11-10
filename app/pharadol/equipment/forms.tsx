"use client";
import { useState } from "react";
import { EquipmentImageEditor } from "./images";
import type { ImageManifest } from "@/lib/equipment/image-validation";
import type { FormEvent, ReactNode } from "react";
import type {
  Category,
  Checkout,
  Equipment,
  Maintenance,
} from "@/lib/equipment/types";
import {
  Button,
  EquipmentPicker,
  Field,
  Notes,
  Select,
  inputClass,
  statusLabels,
  today,
} from "./ui";
export type Submit = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<void>;
function formValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
    string,
    string
  >;
}
function Footer({
  busy,
  disabled = false,
  children = "บันทึกข้อมูล",
}: {
  busy: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="col-span-full mt-3 flex justify-end border-t border-[#DDE5DC] pt-4">
      <Button type="submit" primary disabled={busy || disabled}>
        {busy ? "กำลังบันทึก…" : children}
      </Button>
    </div>
  );
}
const grid = "grid gap-4 sm:grid-cols-2";
export function EquipmentForm({
  equipment: e,
  categories,
  admin,
  busy,
  submit,
}: {
  equipment?: Equipment;
  categories: Category[];
  admin: boolean;
  busy: boolean;
  submit: Submit;
}) {
  const [images, setImages] = useState<ImageManifest | null>(null);
  return (
    <form
      className={grid}
      onSubmit={async (ev) => {
        const p = formValues(ev);
        if (!images) return;
        await submit(e ? "update" : "create", {
          ...p,
          image_manifest: images,
          quantity: Number(p.quantity),
          purchase_price: Number(p.purchase_price),
          ...(e ? { id: e.id, version: e.version } : {}),
        });
      }}
    >
      <EquipmentImageEditor
        equipmentId={e?.id}
        disabled={busy}
        onChange={setImages}
      />
      <div className="col-span-full rounded-xl bg-[#F6F7F3] p-3 text-sm text-[#66756D]">
        {e ? e.equipment_code : "Equipment ID จะสร้างอัตโนมัติเมื่อบันทึก"} ·
        อุปกรณ์ที่มี Serial Number ให้เพิ่มแยกรายชิ้น
      </div>
      <Field
        label="Equipment Name · ชื่ออุปกรณ์ *"
        name="name"
        required
        maxLength={200}
        defaultValue={e?.name}
      />
      <Select
        label="Category · หมวดหมู่ *"
        name="category_id"
        required
        defaultValue={e?.category_id || ""}
      >
        <option value="" disabled>
          เลือกหมวดหมู่
        </option>
        {categories
          .filter((c) => c.active || c.id === e?.category_id)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.active ? " (ปิดใช้งาน)" : ""}
            </option>
          ))}
      </Select>
      <Field
        label="Brand · ยี่ห้อ"
        name="manufacturer"
        maxLength={200}
        defaultValue={e?.manufacturer}
      />
      <Field
        label="Model · รุ่น"
        name="model"
        maxLength={200}
        defaultValue={e?.model}
      />
      <Field
        label="Serial Number"
        name="serial_number"
        maxLength={160}
        defaultValue={e?.serial_number || ""}
      />
      <Field
        label="Quantity · จำนวนทั้งหมด *"
        name="quantity"
        type="number"
        required
        min={1}
        max={1000000}
        step={1}
        readOnly={!!e && !admin}
        defaultValue={e?.quantity || 1}
      />
      <Field
        label="Unit · หน่วย *"
        name="unit"
        maxLength={40}
        required
        defaultValue={e?.unit || "ชิ้น"}
      />
      <Field
        label="Storage Location · สถานที่จัดเก็บ"
        name="storage_location"
        maxLength={200}
        defaultValue={e?.storage_location}
      />
      {!e && (
        <Select
          label="สถานะเริ่มต้น"
          name="initial_status"
          defaultValue="available"
        >
          <option value="available">พร้อมใช้งาน</option>
          <option value="damaged">ชำรุด</option>
          <option value="retired">ปลดระวาง</option>
        </Select>
      )}
      <Notes
        label="Description · รายละเอียด"
        name="description"
        value={e?.description}
      />
      <h3 className="col-span-full mt-2 border-t border-[#DDE5DC] pt-4 font-semibold">
        ข้อมูลการซื้อ
      </h3>
      <Field
        label="Purchase Date · วันที่ซื้อ"
        name="purchase_date"
        type="date"
        defaultValue={e?.purchase_date || ""}
      />
      <Field
        label="Purchase Price · ราคาซื้อต่อหน่วย (บาท) *"
        name="purchase_price"
        type="number"
        required
        min={0}
        max={999999999999.99}
        step="0.01"
        defaultValue={e?.purchase_price || 0}
      />
      <Field
        label="Supplier · ผู้จำหน่าย"
        name="supplier"
        maxLength={200}
        defaultValue={e?.supplier}
      />
      <Field
        label="Warranty Expiration · วันหมดประกัน"
        name="warranty_expiration"
        type="date"
        defaultValue={e?.warranty_expiration || ""}
      />
      <p className="col-span-full text-xs text-[#66756D]">
        ใบเสร็จและเอกสารแนบเพิ่มได้ในแท็บ Documents หลังบันทึก · สถานะ In Use
        และ Maintenance เปลี่ยนผ่านรายการเบิกหรือส่งซ่อม
        เพื่อรักษาประวัติและยอดคงเหลือ
      </p>
      <Footer busy={busy} disabled={!images} />
    </form>
  );
}
export function CheckoutForm({
  busy,
  submit,
}: {
  busy: boolean;
  submit: Submit;
}) {
  const [selected, setSelected] = useState<
    { equipment: Equipment; quantity: number }[]
  >([]);
  return (
    <form
      className={grid}
      onSubmit={async (e) => {
        const p = formValues(e);
        await submit("checkout", {
          ...p,
          items: selected.map((s) => ({
            equipment_id: s.equipment.id,
            quantity: s.quantity,
          })),
        });
      }}
    >
      <Field
        label="Borrower · ผู้เบิก *"
        name="borrower"
        required
        maxLength={200}
      />
      <Field
        label="Related Booking · รหัสใบจอง (ไม่บังคับ)"
        name="related_booking"
        maxLength={160}
      />
      <Field
        label="Checkout Date · วันที่เบิก *"
        name="checkout_date"
        required
        type="date"
        defaultValue={today()}
      />
      <Field
        label="Expected Return · กำหนดคืน *"
        name="expected_return_date"
        required
        type="date"
        defaultValue={today()}
      />
      <EquipmentPicker
        onSelect={(equipment) =>
          setSelected((prev) =>
            prev.some((s) => s.equipment.id === equipment.id)
              ? prev
              : [...prev, { equipment, quantity: 1 }],
          )
        }
      />
      {selected.map((s) => (
        <div
          key={s.equipment.id}
          className="col-span-full flex flex-wrap items-end gap-3 rounded-xl bg-[#F6F7F3] p-3"
        >
          <div className="min-w-0 flex-1 text-sm">
            <b>{s.equipment.name}</b>
            <p className="text-xs text-[#66756D]">
              {s.equipment.equipment_code} · พร้อมใช้ {s.equipment.available}{" "}
              {s.equipment.unit}
            </p>
          </div>
          <div className="w-24">
            <Field
              label="จำนวน *"
              type="number"
              required
              min={1}
              max={s.equipment.available}
              value={s.quantity}
              onChange={(e) =>
                setSelected((prev) =>
                  prev.map((v) =>
                    v.equipment.id === s.equipment.id
                      ? { ...v, quantity: Number(e.target.value) }
                      : v,
                  ),
                )
              }
            />
          </div>
          <Button
            onClick={() =>
              setSelected((prev) =>
                prev.filter((v) => v.equipment.id !== s.equipment.id),
              )
            }
          >
            นำออก
          </Button>
        </div>
      ))}
      <Notes />
      <Footer busy={busy}>
        {selected.length
          ? `ยืนยันเบิก ${selected.length} รายการ`
          : "เลือกอุปกรณ์ก่อนยืนยัน"}
      </Footer>
    </form>
  );
}
export function ReturnForm({
  checkout,
  busy,
  submit,
}: {
  checkout: Checkout;
  busy: boolean;
  submit: Submit;
}) {
  const items = checkout.items.filter((i) => i.returned_quantity < i.quantity),
    [itemId, setItemId] = useState(items[0]?.id || "");
  const item = items.find((i) => i.id === itemId);
  return (
    <form
      className={grid}
      onSubmit={async (e) => {
        const p = formValues(e);
        await submit("return", { ...p, quantity: Number(p.quantity) });
      }}
    >
      <div className="col-span-full rounded-xl bg-[#F6F7F3] p-3 text-sm">
        {checkout.checkout_code} · {checkout.borrower}
      </div>
      <Select
        label="อุปกรณ์ที่คืน *"
        name="item_id"
        required
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
      >
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.equipment?.name} · ค้าง {i.quantity - i.returned_quantity}
          </option>
        ))}
      </Select>
      <Field
        label="จำนวนที่คืน *"
        name="quantity"
        key={itemId}
        type="number"
        min={1}
        max={item ? item.quantity - item.returned_quantity : 0}
        required
        defaultValue={1}
      />
      <Field
        label="วันที่คืน *"
        name="return_date"
        type="date"
        min={checkout.checkout_date}
        required
        defaultValue={today()}
      />
      <Select
        label="สภาพเมื่อรับคืน *"
        name="condition"
        defaultValue="available"
      >
        <option value="available">ปกติ · พร้อมใช้งาน</option>
        <option value="damaged">ชำรุด</option>
        <option value="maintenance">ส่งซ่อม / รอตรวจสอบ</option>
      </Select>
      <Notes />
      <p className="col-span-full text-xs text-[#66756D]">
        คืนบางส่วนได้ จำนวนที่ยังไม่คืนจะคงอยู่ในใบเบิกนี้
      </p>
      <Footer busy={busy}>ยืนยันรับคืน</Footer>
    </form>
  );
}
export function MaintenanceForm({
  equipment: initial,
  maintenance: m,
  busy,
  submit,
}: {
  equipment?: Equipment;
  maintenance?: Maintenance;
  busy: boolean;
  submit: Submit;
}) {
  const [equipment, setEquipment] = useState<Equipment | undefined>(initial);
  return (
    <form
      className={grid}
      onSubmit={async (e) => {
        const p = formValues(e);
        await submit(m ? "maintenance_update" : "maintenance_create", {
          ...p,
          ...(m
            ? { id: m.id, cost: Number(p.cost) }
            : { equipment_id: equipment?.id, quantity: Number(p.quantity) }),
        });
      }}
    >
      {m ? (
        <div className="col-span-full rounded-xl bg-[#F6F7F3] p-3 text-sm">
          {m.maintenance_code} · {m.issue} · {m.quantity} ชิ้น
        </div>
      ) : (
        <>
          <EquipmentPicker onSelect={setEquipment} />
          <p className="col-span-full text-sm">
            อุปกรณ์ที่เลือก: <b>{equipment?.name || "กรุณาเลือกอุปกรณ์"}</b>
          </p>
          <Field
            label="จำนวนที่ส่งซ่อม *"
            name="quantity"
            required
            type="number"
            min={1}
            max={equipment?.quantity || 1}
            defaultValue={1}
          />
          <Select label="ย้ายจากสถานะ" name="source" defaultValue="available">
            <option value="available">พร้อมใช้งาน</option>
            <option value="damaged">ชำรุด</option>
          </Select>
          <Notes label="Issue Description · อาการ / ปัญหา *" name="issue" />
          <Field
            label="Reported Date · วันที่แจ้ง *"
            name="reported_date"
            required
            type="date"
            defaultValue={today()}
          />
        </>
      )}
      <Field
        label="Repair Start · วันที่เริ่มซ่อม"
        name="start_date"
        type="date"
        defaultValue={m?.start_date || ""}
      />
      <Field
        label="Service Provider · ผู้ให้บริการซ่อม"
        name="service_provider"
        maxLength={200}
        defaultValue={m?.service_provider}
      />
      {m && (
        <>
          <Select
            label="Repair Status · สถานะ *"
            name="status"
            defaultValue={m.status}
          >
            {["pending", "in_progress", "completed", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
          <Field
            label="Repair Cost · ค่าใช้จ่าย (บาท) *"
            name="cost"
            type="number"
            min={0}
            max={999999999999.99}
            step="0.01"
            required
            defaultValue={m.cost}
          />
          <Field
            label="Completion Date · วันที่ซ่อมเสร็จ"
            name="completion_date"
            type="date"
            defaultValue={m.completion_date || ""}
          />
          <p className="col-span-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            การเลือก “ซ่อมเสร็จ / ยืนยันแล้ว”
            คือการตรวจรับโดยผู้ดูแลและย้ายอุปกรณ์กลับเป็นพร้อมใช้งาน
          </p>
        </>
      )}
      <Notes value={m?.notes} />
      <Footer busy={busy}>
        {m ? "บันทึกและยืนยันผลการซ่อม" : "บันทึกส่งซ่อม"}
      </Footer>
    </form>
  );
}
export function CategoryForm({
  category,
  busy,
  submit,
}: {
  category?: Category;
  busy: boolean;
  submit: Submit;
}) {
  return (
    <form
      className={grid}
      onSubmit={async (e) => {
        const p = formValues(e);
        await submit("category_save", {
          name: p.name,
          ...(category ? { id: category.id, active: p.active === "true" } : {}),
        });
      }}
    >
      <Field
        label="ชื่อหมวดหมู่ *"
        name="name"
        required
        maxLength={120}
        defaultValue={category?.name}
      />
      {category && (
        <Select
          label="สถานะหมวดหมู่"
          name="active"
          defaultValue={String(category.active)}
        >
          <option value="true">เปิดใช้งาน</option>
          <option value="false">ปิดใช้งาน (เก็บประวัติอุปกรณ์ไว้)</option>
        </Select>
      )}
      <Footer busy={busy} />
    </form>
  );
}
export function StockForm({
  equipment,
  busy,
  submit,
}: {
  equipment: Equipment;
  busy: boolean;
  submit: Submit;
}) {
  return (
    <form
      className={grid}
      onSubmit={async (e) => {
        const p = formValues(e);
        await submit("stock_adjust", {
          ...p,
          id: equipment.id,
          quantity: Number(p.quantity),
        });
      }}
    >
      <p className="col-span-full text-sm">
        {equipment.name} · การเปลี่ยนสถานะนี้จะเก็บประวัติทุกครั้ง
      </p>
      <Select label="ย้ายจาก" name="source">
        {["available", "damaged", "retired"].map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]} (
            {equipment[s as "available" | "damaged" | "retired"]})
          </option>
        ))}
      </Select>
      <Select label="ไปยัง" name="condition" defaultValue="damaged">
        {["available", "damaged", "retired"].map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </Select>
      <Field
        label="จำนวน *"
        type="number"
        name="quantity"
        min={1}
        max={equipment.quantity}
        required
        defaultValue={1}
      />
      <Footer busy={busy}>ยืนยันเปลี่ยนสถานะ</Footer>
    </form>
  );
}
export function FileForm({
  equipmentId,
  maintenanceId,
  onUploaded,
}: {
  equipmentId: string;
  maintenanceId?: string;
  onUploaded: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={`${grid} rounded-xl border border-[#DDE5DC] p-4`}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          data = new FormData(form);
        data.set("equipment_id", equipmentId);
        if (maintenanceId) data.set("maintenance_id", maintenanceId);
        setBusy(true);
        setError("");
        try {
          const r = await fetch("/api/equipment/files", {
            method: "POST",
            body: data,
          });
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          form.reset();
          await onUploaded();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Select
        label="ประเภทไฟล์"
        name="kind"
        defaultValue={maintenanceId ? "maintenance" : "document"}
      >
        {(maintenanceId
          ? [["maintenance", "เอกสารการซ่อม"]]
          : [
              ["receipt", "ใบเสร็จ"],
              ["document", "เอกสารประกอบ"],
            ]
        ).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      <label className="grid content-start gap-1.5 text-xs font-medium text-[#66756D]">
        ไฟล์ JPEG / PNG / WebP / PDF ไม่เกิน 3 MB
        <input
          className={inputClass}
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={busy}
        />
      </label>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-700">
          {error}
        </p>
      )}
      <Footer busy={busy}>อัปโหลดไฟล์ส่วนตัว</Footer>
    </form>
  );
}
