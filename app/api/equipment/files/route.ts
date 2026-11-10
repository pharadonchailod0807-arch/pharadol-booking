import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  authorizeEquipment,
  equipmentDb,
  equipmentFailure,
  equipmentJson,
  limitEquipment,
} from "@/lib/equipment/server";
import { EquipmentError, uuid } from "@/lib/equipment/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await authorizeEquipment(request);
    const db = equipmentDb(),
      id = uuid(request.nextUrl.searchParams.get("id"));
    const { data: doc, error } = await db
      .from("equipment_documents")
      .select("storage_path,mime_type,filename")
      .eq("id", id)
      .eq("brand", "pharadol")
      .maybeSingle();
    if (error) throw error;
    if (!doc) throw new EquipmentError("ไม่พบไฟล์", 404);
    const file = await db.storage
      .from("equipment-private")
      .download(doc.storage_path);
    if (file.error) throw file.error;
    const inline =
      request.nextUrl.searchParams.get("inline") === "1" &&
      doc.mime_type.startsWith("image/");
    return new Response(file.data, {
      headers: {
        "Content-Type": doc.mime_type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="equipment-file"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return equipmentFailure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { actor, permissions } = await authorizeEquipment(request, true);
    const limited = limitEquipment(actor);
    if (limited) return limited;
    if (Number(request.headers.get("content-length")) > 3300000)
      throw new EquipmentError("ไฟล์ต้องมีขนาดไม่เกิน 3 MB", 413);
    const form = await request.formData(),
      file = form.get("file");
    const maintenanceId = form.get("maintenance_id")
      ? uuid(form.get("maintenance_id"))
      : null;
    const id = uuid(form.get("equipment_id")),
      kind = String(form.get("kind") || "document");
    if (!(file instanceof File) || file.size < 1 || file.size > 3145728)
      throw new EquipmentError("ไฟล์ต้องมีขนาดไม่เกิน 3 MB");
    if (
      ![
        "image",
        "additional_image",
        "receipt",
        "document",
        "maintenance",
      ].includes(kind)
    )
      throw new EquipmentError("ประเภทเอกสารไม่ถูกต้อง");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? "image/jpeg"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : bytes.toString("ascii", 0, 5) === "%PDF-"
            ? "application/pdf"
            : "";
    if (
      !mime ||
      file.type !== mime ||
      (["image", "additional_image"].includes(kind) &&
        !mime.startsWith("image/"))
    )
      throw new EquipmentError(
        "รองรับเฉพาะ JPEG, PNG, WebP และ PDF ที่ถูกต้อง",
      );
    const db = equipmentDb();
    const equipment = await db
      .from("equipment")
      .select("id")
      .eq("id", id)
      .eq("brand", "pharadol")
      .maybeSingle();
    if (equipment.error) throw equipment.error;
    if (!equipment.data) throw new EquipmentError("ไม่พบอุปกรณ์", 404);
    const path = `pharadol/${id}/${randomUUID()}`;
    const upload = await db.storage
      .from("equipment-private")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upload.error) throw upload.error;
    const payload = {
      equipment_id: id,
      maintenance_id: maintenanceId,
      kind,
      filename: file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 200),
      mime_type: mime,
      storage_path: path,
      size: bytes.length,
    };
    const result = await db.rpc("equipment_mutate", {
      p_action: "document_add",
      p_payload: payload,
      p_actor: actor,
      p_request_id: randomUUID(),
      p_admin: permissions.admin,
    });
    if (result.error) {
      await db.storage.from("equipment-private").remove([path]);
      throw result.error;
    }
    return equipmentJson({ success: true, document: result.data });
  } catch (e) {
    return equipmentFailure(e);
  }
}
