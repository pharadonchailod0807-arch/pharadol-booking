import "server-only";
import { equipmentDb } from "./server";
// Raw signed-upload paths remain tracked until their two-hour capabilities have expired.
// Only disposable uploads are removed. Existing/removed equipment photographs are retained privately.
export async function cleanupEquipmentImageUploads(db = equipmentDb()) {
  // Grace exceeds the processing route's 60-second lifetime; never race an in-flight finalizer.
  const threshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await db
    .from("equipment_image_uploads")
    .select("*")
    .lt("expires_at", threshold)
    .limit(30);
  if (rows.error) throw rows.error;
  for (const u of rows.data || []) {
    const paths =
      u.status === "attached"
        ? [u.raw_path]
        : [u.raw_path, u.storage_path, u.thumbnail_path];
    const removal = await db.storage.from("equipment-images").remove(paths);
    if (!removal.error)
      await db
        .from("equipment_image_uploads")
        .delete()
        .eq("id", u.id)
        .lt("expires_at", threshold);
  }
}
