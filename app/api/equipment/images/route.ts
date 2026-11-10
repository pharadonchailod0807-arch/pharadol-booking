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
import { validateImageFile } from "@/lib/equipment/image-validation";
import { normalizeEquipmentImage } from "@/lib/equipment/image-processing";
import { cleanupEquipmentImageUploads } from "@/lib/equipment/image-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const { actor, permissions } = await authorizeEquipment(request);
    const db = equipmentDb();
    if (request.nextUrl.searchParams.has("equipment_id")) {
      const id = uuid(request.nextUrl.searchParams.get("equipment_id"));
      const r = await db
        .from("equipment_images")
        .select("id,equipment_id,filename,is_cover,sort_order,created_at")
        .eq("brand", "pharadol")
        .eq("equipment_id", id)
        .is("deleted_at", null)
        .order("sort_order");
      if (r.error) throw r.error;
      return equipmentJson({ success: true, images: r.data });
    }
    const id = uuid(request.nextUrl.searchParams.get("id"));
    const row = await db
      .from("equipment_images")
      .select("*")
      .eq("brand", "pharadol")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (row.error) throw row.error;
    let image = row.data;
    if (!image && permissions.write) {
      const staged = await db
        .from("equipment_image_uploads")
        .select("*")
        .eq("id", id)
        .eq("actor", actor)
        .eq("status", "ready")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (staged.error) throw staged.error;
      if (staged.data)
        image = { ...staged.data, bucket_id: "equipment-images" };
    }
    if (!image)
      throw new EquipmentError("ไม่พบรูปภาพหรือไม่มีสิทธิ์เข้าถึง", 404);
    const path =
      request.nextUrl.searchParams.get("thumbnail") === "1"
        ? image.thumbnail_path
        : image.storage_path;
    const signed = await db.storage
      .from(image.bucket_id)
      .createSignedUrl(path, 60);
    if (signed.error) throw signed.error;
    return new Response(null, {
      status: 302,
      headers: {
        Location: signed.data.signedUrl,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return equipmentFailure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { actor } = await authorizeEquipment(request, true);
    const limited = limitEquipment(actor);
    if (limited) return limited;
    if (Number(request.headers.get("content-length")) > 12000)
      throw new EquipmentError("ข้อมูลไม่ถูกต้อง", 413);
    const body = await request.json();
    const db = equipmentDb();
    if (body.action === "cleanup") {
      await cleanupEquipmentImageUploads(db);
      return equipmentJson({ success: true });
    }
    if (body.action === "prepare") {
      const draft = uuid(body.draft_id),
        target = body.equipment_id ? uuid(body.equipment_id) : null;
      const filename = String(body.filename || "")
        .replace(/[\u0000-\u001f]/g, "")
        .slice(0, 200);
      const mime = validateImageFile({
        name: filename,
        type: String(body.mime_type || ""),
        size: Number(body.size),
      });
      if (target) {
        const e = await db
          .from("equipment")
          .select("id,archived_at")
          .eq("id", target)
          .eq("brand", "pharadol")
          .maybeSingle();
        if (e.error) throw e.error;
        if (!e.data || e.data.archived_at)
          throw new EquipmentError("ไม่พบอุปกรณ์หรืออุปกรณ์ถูก Archive", 404);
      }
      await cleanupEquipmentImageUploads(db);
      const count = await db
        .from("equipment_image_uploads")
        .select("id", { count: "exact", head: true })
        .eq("actor", actor)
        .gt("expires_at", new Date().toISOString())
        .in("status", ["pending", "processing", "ready"]);
      if (count.error) throw count.error;
      if ((count.count || 0) >= 20)
        throw new EquipmentError(
          "มีรูปที่กำลังอัปโหลดมากเกินไป กรุณาปิดฟอร์มเก่าหรือลองใหม่ภายหลัง",
          429,
        );
      const id = randomUUID(),
        prefix = `pharadol/${draft}/${id}`;
      const u = {
        id,
        draft_id: draft,
        target_equipment_id: target,
        actor,
        raw_path: `${prefix}/source`,
        storage_path: `${prefix}/image.webp`,
        thumbnail_path: `${prefix}/thumbnail.webp`,
        filename,
        mime_type: mime,
        original_size: Number(body.size),
      };
      const inserted = await db.from("equipment_image_uploads").insert(u);
      if (inserted.error) throw inserted.error;
      const signed = await db.storage
        .from("equipment-images")
        .createSignedUploadUrl(u.raw_path, { upsert: false });
      if (signed.error) throw signed.error;
      return equipmentJson({
        success: true,
        id,
        upload_url: signed.data.signedUrl,
      });
    }
    const id = uuid(body.id);
    if (body.action === "cancel") {
      const r = await db.rpc("equipment_image_cancel", {
        p_id: id,
        p_actor: actor,
      });
      if (r.error) throw r.error;
      if (r.data?.id)
        await db.storage
          .from("equipment-images")
          .remove([
            r.data.raw_path,
            r.data.storage_path,
            r.data.thumbnail_path,
          ]);
      return equipmentJson({ success: true });
    }
    if (body.action !== "complete")
      throw new EquipmentError("คำสั่งรูปภาพไม่ถูกต้อง");
    const existing = await db
      .from("equipment_image_uploads")
      .select("*")
      .eq("id", id)
      .eq("actor", actor)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data)
      throw new EquipmentError(
        "รายการอัปโหลดหมดอายุ กรุณาเลือกรูปอีกครั้ง",
        404,
      );
    if (existing.data.status === "ready")
      return equipmentJson({ success: true, id });
    const claim = await db
      .from("equipment_image_uploads")
      .update({ status: "processing" })
      .eq("id", id)
      .eq("actor", actor)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (claim.error) throw claim.error;
    const u = claim.data;
    if (!u)
      throw new EquipmentError(
        "รายการอัปโหลดกำลังประมวลผลหรือถูกยกเลิกแล้ว",
        409,
      );
    try {
      const raw = await db.storage
        .from("equipment-images")
        .download(u.raw_path);
      if (raw.error) throw raw.error;
      if (raw.data.size !== u.original_size)
        throw new EquipmentError(
          "ขนาดรูปภาพไม่ตรงกับไฟล์ที่เลือก กรุณาอัปโหลดใหม่",
        );
      const image = await normalizeEquipmentImage(
        Buffer.from(await raw.data.arrayBuffer()),
      );
      for (const [path, bytes] of [
        [u.storage_path, image.bytes],
        [u.thumbnail_path, image.thumbnail],
      ] as const) {
        const r = await db.storage
          .from("equipment-images")
          .upload(path, bytes, { contentType: "image/webp", upsert: false });
        if (r.error) throw r.error;
      }
      const ready = await db
        .from("equipment_image_uploads")
        .update({ status: "ready", width: image.width, height: image.height })
        .eq("id", id)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();
      if (ready.error) throw ready.error;
      if (!ready.data) throw new EquipmentError("ยกเลิกการอัปโหลดแล้ว", 409);
      await db.storage.from("equipment-images").remove([u.raw_path]);
      return equipmentJson({ success: true, id });
    } catch (e) {
      const cancelled = await db.rpc("equipment_image_cancel", {
        p_id: id,
        p_actor: actor,
      });
      if (cancelled.data?.id)
        await db.storage
          .from("equipment-images")
          .remove([u.raw_path, u.storage_path, u.thumbnail_path]);
      throw e;
    }
  } catch (e) {
    return equipmentFailure(e);
  }
}
