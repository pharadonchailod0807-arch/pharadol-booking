import type { NextRequest } from "next/server";
import {
  authorizeEquipment,
  equipmentDb,
  equipmentFailure,
  equipmentJson,
  inventoryQuery,
  limitEquipment,
} from "@/lib/equipment/server";
import {
  EquipmentError,
  uuid,
  validateMutation,
} from "@/lib/equipment/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { permissions } = await authorizeEquipment(request);
    const db = equipmentDb();
    const sp = request.nextUrl.searchParams;
    const mode = sp.get("mode") || "inventory";
    if (mode === "inventory") {
      const { query, params: p } = inventoryQuery(db, sp);
      const [inventory, categories, summary] = await Promise.all([
        query.range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1),
        db
          .from("equipment_categories")
          .select("id,name,active")
          .eq("brand", "pharadol")
          .order("name"),
        db.rpc("equipment_summary"),
      ]);
      for (const r of [inventory, categories, summary])
        if (r.error) throw r.error;
      const ids = (inventory.data || []).map((e) => e.id);
      const images = ids.length
        ? await db
            .from("equipment_documents")
            .select("id,equipment_id")
            .eq("brand", "pharadol")
            .eq("kind", "image")
            .in("equipment_id", ids)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (images.error) throw images.error;
      return equipmentJson({
        success: true,
        equipment: (inventory.data || []).map((e) => ({
          ...e,
          image_id: images.data?.find((d) => d.equipment_id === e.id)?.id,
        })),
        total: inventory.count,
        page: p.page,
        pageSize: p.pageSize,
        categories: categories.data,
        summary: summary.data,
        permissions,
      });
    }
    const page = Math.max(
        1,
        Math.min(100000, Math.floor(Number(sp.get("page")) || 1)),
      ),
      from = (page - 1) * 20;
    if (mode === "detail") {
      const id = uuid(sp.get("id"));
      const equipment = await db
        .from("equipment_inventory")
        .select("*")
        .eq("brand", "pharadol")
        .eq("id", id)
        .maybeSingle();
      if (equipment.error) throw equipment.error;
      if (!equipment.data) throw new EquipmentError("ไม่พบอุปกรณ์", 404);
      const maintenanceId = sp.get("maintenance_id")
        ? uuid(sp.get("maintenance_id"))
        : null;
      let documentQuery = db
        .from("equipment_documents")
        .select("id,filename,kind,mime_type,size,maintenance_id,created_at", {
          count: "exact",
        })
        .eq("brand", "pharadol")
        .eq("equipment_id", id);
      if (maintenanceId)
        documentQuery = documentQuery.eq("maintenance_id", maintenanceId);
      const [maintenance, documents, activity, costs, images, returns] =
        await Promise.all([
          db
            .from("equipment_maintenance")
            .select("*", { count: "exact" })
            .eq("brand", "pharadol")
            .eq("equipment_id", id)
            .order("created_at", { ascending: false })
            .range(from, from + 19),
          documentQuery
            .order("created_at", { ascending: false })
            .range(from, from + 19),
          db
            .from("equipment_activity_logs")
            .select("*", { count: "exact" })
            .eq("brand", "pharadol")
            .eq("equipment_id", id)
            .order("id", { ascending: false })
            .range(from, from + 19),
          db.rpc("equipment_maintenance_total", { p_equipment_id: id }),
          db
            .from("equipment_documents")
            .select("id,filename,kind,mime_type,size,maintenance_id,created_at")
            .eq("brand", "pharadol")
            .eq("equipment_id", id)
            .in("kind", ["image", "additional_image"])
            .order("created_at", { ascending: false })
            .limit(20),
          db.rpc("equipment_return_history", {
            p_equipment_id: id,
            p_offset: from,
          }),
        ]);
      for (const r of [
        maintenance,
        documents,
        activity,
        costs,
        images,
        returns,
      ])
        if (r.error) throw r.error;
      const checkouts = await db
        .from("equipment_checkouts")
        .select(
          "*,items:equipment_checkout_items!inner(*,equipment:equipment(name,equipment_code))",
          { count: "exact" },
        )
        .eq("brand", "pharadol")
        .eq("items.equipment_id", id)
        .order("created_at", { ascending: false })
        .range(from, from + 19);
      if (checkouts.error) throw checkouts.error;
      return equipmentJson({
        success: true,
        equipment: equipment.data,
        checkouts: checkouts.data,
        returns: returns.data.rows,
        returnsTotal: returns.data.total,
        documentsTotal: documents.count,
        images: images.data,
        maintenance: maintenance.data,
        documents: documents.data,
        activity: activity.data,
        historyTotal: checkouts.count,
        maintenanceTotal: maintenance.count,
        activityTotal: activity.count,
        maintenanceExpenses: costs.data,
      });
    }
    if (mode === "checkouts") {
      const q = db
        .from("equipment_checkouts")
        .select(
          "*,items:equipment_checkout_items(*,equipment:equipment(name,equipment_code))",
          { count: "exact" },
        )
        .eq("brand", "pharadol");
      const r = await q
        .order("created_at", { ascending: false })
        .range(from, from + 19);
      if (r.error) throw r.error;
      return equipmentJson({
        success: true,
        checkouts: r.data,
        total: r.count,
        page,
      });
    }
    if (mode === "maintenance") {
      const r = await db
        .from("equipment_maintenance")
        .select("*,equipment:equipment(name,equipment_code)", {
          count: "exact",
        })
        .eq("brand", "pharadol")
        .order("created_at", { ascending: false })
        .range(from, from + 19);
      if (r.error) throw r.error;
      return equipmentJson({
        success: true,
        maintenance: r.data,
        total: r.count,
        page,
      });
    }
    if (mode === "activity") {
      const r = await db
        .from("equipment_activity_logs")
        .select("*", { count: "exact" })
        .eq("brand", "pharadol")
        .order("id", { ascending: false })
        .range(from, from + 19);
      if (r.error) throw r.error;
      return equipmentJson({
        success: true,
        activity: r.data,
        total: r.count,
        page,
      });
    }
    throw new EquipmentError("ไม่พบหน้าที่ต้องการ");
  } catch (e) {
    return equipmentFailure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { actor, permissions } = await authorizeEquipment(request, true);
    const limited = limitEquipment(actor);
    if (limited) return limited;
    if (Number(request.headers.get("content-length")) > 100000)
      throw new EquipmentError("ข้อมูลมีขนาดใหญ่เกินไป", 413);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string")
      throw new EquipmentError("ข้อมูลไม่ถูกต้อง");
    const adminActions = [
      "archive",
      "restore",
      "category_save",
      "maintenance_update",
      "stock_adjust",
    ];
    if (adminActions.includes(body.action) && !permissions.admin)
      throw new EquipmentError("รายการนี้ต้องใช้สิทธิ์ผู้ดูแล", 403);
    const payload = validateMutation(body.action, body.payload),
      requestId = uuid(body.requestId);
    const { data, error } = await equipmentDb().rpc("equipment_mutate", {
      p_action: body.action,
      p_payload: payload,
      p_actor: actor,
      p_request_id: requestId,
      p_admin: permissions.admin,
    });
    if (error) throw error;
    return equipmentJson({ success: true, result: data });
  } catch (e) {
    return equipmentFailure(e);
  }
}
