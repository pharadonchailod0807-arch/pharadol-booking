import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  validateImageFile,
  validateImageManifest,
  MAX_IMAGE_BYTES,
} from "../../lib/equipment/image-validation.ts";
import { normalizeEquipmentImage } from "../../lib/equipment/image-processing.ts";
import { startEquipmentTestDatabase } from "../../scripts/equipment-test-db.mjs";

test("Image validation enforces five photos, distinct IDs, cover, 10 MB, types and explicit HEIC feedback", () => {
  for (const name of ["a.jpg", "a.JPEG", "a.png", "a.webp"])
    assert.ok(validateImageFile({ name, type: "", size: MAX_IMAGE_BYTES }));
  for (const size of [0, -1, 1.2, NaN, Infinity, MAX_IMAGE_BYTES + 1])
    assert.throws(() =>
      validateImageFile({ name: "a.jpg", type: "image/jpeg", size }),
    );
  for (const name of ["a.svg", "a.gif", "a.pdf", "a.exe", "a.jpg.exe"])
    assert.throws(() =>
      validateImageFile({ name, type: "image/jpeg", size: 100 }),
    );
  assert.throws(
    () => validateImageFile({ name: "a.heic", type: "image/heic", size: 100 }),
    /HEIC/,
  );
  assert.throws(() =>
    validateImageFile({ name: "a.png", type: "image/jpeg", size: 100 }),
  );
  const ids = Array.from({ length: 5 }, randomUUID),
    draft_id = randomUUID();
  assert.equal(
    validateImageManifest({ ids, cover_id: ids[2], draft_id }).ids.length,
    5,
  );
  assert.throws(() =>
    validateImageManifest({
      ids: [...ids, randomUUID()],
      cover_id: ids[0],
      draft_id,
    }),
  );
  assert.throws(() =>
    validateImageManifest({
      ids: [ids[0], ids[0]],
      cover_id: ids[0],
      draft_id,
    }),
  );
  assert.throws(() =>
    validateImageManifest({ ids, cover_id: randomUUID(), draft_id }),
  );
});

test("Server decodes and re-encodes images, strips metadata, bounds dimensions and rejects spoofed/corrupt images", async () => {
  const bytes = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: "#183024" },
  })
    .jpeg()
    .toBuffer();
  const output = await normalizeEquipmentImage(bytes);
  assert.equal(output.width, 2560);
  assert.ok(output.height < 1000);
  assert.equal((await sharp(output.bytes).metadata()).format, "webp");
  const thumb = await sharp(output.thumbnail).metadata();
  assert.ok(thumb.width <= 240);
  assert.ok(thumb.height <= 240);
  const padded = Buffer.concat([bytes, Buffer.alloc(6 * 1024 * 1024)]);
  assert.ok(
    (await normalizeEquipmentImage(padded)).bytes.length < MAX_IMAGE_BYTES,
  );
  for (const bytes of [
    Buffer.from("<svg></svg>"),
    Buffer.from("%PDF-123"),
    Buffer.from([255, 216, 255]),
    Buffer.alloc(MAX_IMAGE_BYTES + 1),
  ])
    await assert.rejects(() => normalizeEquipmentImage(bytes));
});

test("Equipment images save atomically with inventory, enforce cover/limit/ownership, handle retry and preserve ledgers", async (t) => {
  const db = await startEquipmentTestDatabase();
  try {
    const q = (sql, args = []) => db.pool.query(sql, args);
    const category = (await q("SELECT id FROM equipment_categories LIMIT 1"))
      .rows[0].id;
    const actor = "image-test:tester",
      draft = randomUUID();
    const payload = (extra = {}) => ({
      brand: "pharadol",
      name: "Image transaction test",
      category_id: category,
      manufacturer: "",
      model: "",
      serial_number: "",
      description: "",
      quantity: 2,
      unit: "ชิ้น",
      storage_location: "",
      purchase_date: "",
      purchase_price: 0,
      supplier: "",
      warranty_expiration: "",
      initial_status: "available",
      ...extra,
    });
    async function upload({
      owner = actor,
      draftId = draft,
      target = null,
      state = "ready",
    } = {}) {
      const id = randomUUID();
      await q(
        "INSERT INTO equipment_image_uploads(id,draft_id,target_equipment_id,actor,raw_path,storage_path,thumbnail_path,filename,original_size,mime_type,status) VALUES($1,$2,$3,$4,$5,$6,$7,'test.png',100,'image/png',$8)",
        [
          id,
          draftId,
          target,
          owner,
          `${id}/source`,
          `${id}/image`,
          `${id}/thumbnail`,
          state,
        ],
      );
      return id;
    }
    async function save(action, p, key = randomUUID(), who = actor) {
      const c = await db.pool.connect();
      try {
        await c.query("SET ROLE service_role");
        return (
          await c.query(
            "SELECT equipment_save_images($1,$2,$3,$4,true) result",
            [action, p, who, key],
          )
        ).rows[0].result;
      } finally {
        await c.query("RESET ROLE");
        c.release();
      }
    }
    const manifest = (ids, cover = ids[0] || "") => ({
      ids,
      cover_id: cover,
      draft_id: draft,
    });
    const ids = await Promise.all(Array.from({ length: 5 }, () => upload()));
    const p = payload({ image_manifest: manifest(ids, ids[2]) }),
      key = randomUUID();
    const e = await save("create", p, key);
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL",
          [e.id],
        )
      ).rows[0].count,
      "5",
    );
    assert.equal(
      (
        await q(
          "SELECT id FROM equipment_images WHERE equipment_id=$1 AND is_cover",
          [e.id],
        )
      ).rows[0].id,
      ids[2],
    );
    assert.equal((await save("create", p, key)).id, e.id);
    await assert.rejects(() =>
      save("create", {
        ...p,
        image_manifest: manifest([...ids, randomUUID()]),
      }),
    );
    const before = (await q("SELECT * FROM equipment WHERE id=$1", [e.id]))
      .rows[0];
    await assert.rejects(() =>
      save(
        "update",
        payload({
          id: e.id,
          version: e.version,
          quantity: 0,
          image_manifest: manifest([]),
        }),
      ),
    );
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL",
          [e.id],
        )
      ).rows[0].count,
      "5",
    );
    const next = [ids[4], ids[0], ids[1]];
    const updated = await save(
      "update",
      payload({
        id: e.id,
        version: e.version,
        image_manifest: manifest(next, next[0]),
      }),
    );
    assert.deepEqual(
      (
        await q(
          "SELECT id FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL ORDER BY sort_order",
          [e.id],
        )
      ).rows.map((r) => r.id),
      next,
    );
    assert.equal(
      (
        await q(
          "SELECT id FROM equipment_images WHERE is_cover AND equipment_id=$1",
          [e.id],
        )
      ).rows[0].id,
      next[0],
    );
    const after = (await q("SELECT * FROM equipment WHERE id=$1", [e.id]))
      .rows[0];
    for (const col of [
      "id",
      "quantity",
      "available",
      "in_use",
      "maintenance",
      "damaged",
      "retired",
      "status",
      "equipment_code",
    ])
      assert.equal(after[col], before[col]);
    for (const [owner, draftId, state] of [
      ["other", draft, "ready"],
      [actor, randomUUID(), "ready"],
      [actor, draft, "pending"],
    ]) {
      const bad = await upload({ owner, draftId, state });
      await assert.rejects(
        () =>
          save(
            "update",
            payload({
              id: e.id,
              version: updated.version,
              image_manifest: manifest([bad]),
            }),
          ),
        /not ready|belongs/,
      );
    }
    const c = await db.pool.connect();
    try {
      await c.query("SET ROLE service_role");
      const r = await c.query("SELECT equipment_image_cancel($1,$2) result", [
        next[0],
        actor,
      ]);
      assert.equal(r.rows[0].result, null);
    } finally {
      await c.query("RESET ROLE");
      c.release();
    }
    await save(
      "update",
      payload({
        id: e.id,
        version: updated.version,
        image_manifest: manifest([]),
      }),
    );
    assert.equal(
      (
        await q(
          "SELECT count(*) FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL",
          [e.id],
        )
      ).rows[0].count,
      "0",
    );
    assert.equal(
      (
        await q("SELECT count(*) FROM equipment_images WHERE equipment_id=$1", [
          e.id,
        ])
      ).rows[0].count,
      "5",
    );
    for (const role of ["anon", "authenticated"]) {
      const c = await db.pool.connect();
      try {
        await c.query(`SET ROLE ${role}`);
        for (const sql of [
          "SELECT * FROM equipment_images",
          "SELECT * FROM equipment_image_uploads",
          "SELECT equipment_image_cancel(gen_random_uuid(),'test')",
        ])
          await assert.rejects(() => c.query(sql), /permission denied/);
      } finally {
        await c.query("RESET ROLE");
        c.release();
      }
    }
    await t.test(
      "private image storage cannot be opened by permissive legacy client policy",
      async () => {
        const c = await db.pool.connect();
        try {
          await c.query(
            "INSERT INTO storage.objects(bucket_id) VALUES('equipment-images')",
          );
          await c.query("SET ROLE anon");
          assert.equal(
            (
              await c.query(
                "SELECT * FROM storage.objects WHERE bucket_id='equipment-images'",
              )
            ).rowCount,
            0,
          );
        } finally {
          await c.query("RESET ROLE");
          c.release();
        }
      },
    );
  } finally {
    await db.close();
  }
});

test("Additive image migration preserves inventory and old image documents", async () => {
  const db = await startEquipmentTestDatabase({ images: false });
  try {
    const id = randomUUID(),
      category = (
        await db.pool.query("SELECT id FROM equipment_categories LIMIT 1")
      ).rows[0].id;
    await db.pool.query(
      "INSERT INTO equipment(id,name,category_id,quantity,available,created_by,updated_by) VALUES($1,'legacy image fixture',$2,1,1,'test','test')",
      [id, category],
    );
    for (let n = 0; n < 7; n++)
      await db.pool.query(
        "INSERT INTO equipment_documents(equipment_id,kind,filename,mime_type,storage_path,size,created_by) VALUES($1,'image','old.jpg','image/jpeg',$2,100,'test')",
        [id, `pharadol/${id}/${n}`],
      );
    const before = (
      await db.pool.query("SELECT * FROM equipment WHERE id=$1", [id])
    ).rows;
    await db.pool.query(
      await readFile(
        new URL(
          "../../supabase/migrations/202611100001_equipment_images.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.pool.query("SELECT * FROM equipment WHERE id=$1", [id])).rows,
      before,
    );
    assert.equal(
      (await db.pool.query("SELECT count(*) FROM equipment_documents")).rows[0]
        .count,
      "7",
    );
    assert.equal(
      (await db.pool.query("SELECT count(*) FROM equipment_images")).rows[0]
        .count,
      "5",
    );
    assert.equal(
      (
        await db.pool.query(
          "SELECT count(*) FROM equipment_images WHERE is_cover",
        )
      ).rows[0].count,
      "1",
    );
  } finally {
    await db.close();
  }
});
