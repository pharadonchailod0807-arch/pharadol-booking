import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";
import * as XLSX from "xlsx";
import sharp from "sharp";
import { startEquipmentTestDatabase } from "./equipment-test-db.mjs";
import { startEquipmentTestApi } from "./equipment-test-api.mjs";
const db = await startEquipmentTestDatabase(),
  backend = await startEquipmentTestApi(db.pool);
const secret = "equipment-test-only-secret-at-least-32-characters",
  port = 3347,
  origin = `http://localhost:${port}`;
const admin = {
  id: "equipment-admin",
  username: "EquipmentTest",
  name: "ผู้ทดสอบ",
  role: "BRAND_ADMIN",
  brands: ["pharadol", "adisorn"],
  active: true,
};
function token(user) {
  const now = Math.floor(Date.now() / 1000),
    body = Buffer.from(
      JSON.stringify({ type: "session", user, iat: now, exp: now + 1800 }),
    ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
const headers = (user) => ({
  Cookie: `booking_session=${token(user)}`,
  "Content-Type": "application/json",
  Origin: origin,
});
let logs = "",
  browser,
  app;
const results = [];
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
try {
  app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTH_SECRET: secret,
        FALLBACK_ADMIN_PASSWORD: "equipment-only-test-password",
        FALLBACK_PHARADOL_PASSWORD: "equipment-only-test-password",
        FALLBACK_ADISORN_PASSWORD: "equipment-only-test-password",
        NEXT_PUBLIC_SUPABASE_URL: backend.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "equipment-test-anon",
        SUPABASE_SERVICE_ROLE_KEY: "equipment-test-service",
        NEXT_TELEMETRY_DISABLED: "1",
        MAINTENANCE_MODE: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  app.stdout.on("data", (d) => (logs += d));
  app.stderr.on("data", (d) => (logs += d));
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    if (n === 99) throw new Error("Test app did not start");
    await delay(300);
  }
  const get = async (path, user = admin) => {
    const r = await fetch(origin + path, { headers: headers(user) });
    return { status: r.status, body: await r.json() };
  };
  const mutate = async (action, payload, user = admin, key = randomUUID()) => {
    const r = await fetch(origin + "/api/equipment", {
      method: "POST",
      headers: headers(user),
      body: JSON.stringify({ action, payload, requestId: key }),
    });
    return { status: r.status, body: await r.json() };
  };
  await check(
    "API rejects anonymous / Adisorn / viewer writes / cross-origin requests",
    async () => {
      assert.equal((await fetch(origin + "/api/equipment")).status, 401);
      assert.equal(
        (await get("/api/equipment", { ...admin, brands: ["adisorn"] })).status,
        403,
      );
      assert.equal(
        (await mutate("create", {}, { ...admin, role: "VIEWER" })).status,
        403,
      );
      assert.equal(
        (
          await fetch(origin + "/api/equipment", {
            method: "POST",
            headers: { ...headers(admin), Origin: "https://foreign.invalid" },
            body: "{}",
          })
        ).status,
        403,
      );
    },
  );
  await check(
    "fixed QR URL redirects anonymous users to existing Login and preserves authorized login destinations",
    async () => {
      const anonymous = await fetch(origin + "/pharadol/equipment", {
        redirect: "manual",
      });
      assert.equal(anonymous.status, 307);
      const loginUrl = new URL(anonymous.headers.get("location"), origin);
      assert.equal(loginUrl.pathname, "/login");
      assert.equal(loginUrl.searchParams.get("next"), "/pharadol/equipment");
      for (const [identifier, destination, expected] of [
        ["admin", "/pharadol/equipment", "/pharadol/equipment"],
        ["pharadol", "/pharadol/equipment", "/pharadol/equipment"],
        ["adisorn", "/pharadol/equipment", "/adisorn/welcome"],
        ["admin", "/pharadol/customers", "/admin"],
        ["admin", "https://foreign.invalid/pharadol/equipment", "/admin"],
      ]) {
        const r = await fetch(origin + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({
            identifier,
            password: "equipment-only-test-password",
            redirectTo: destination,
          }),
        });
        const body = await r.json();
        assert.equal(r.status, 200, JSON.stringify(body));
        assert.equal(body.redirectTo, expected);
      }
    },
  );
  let inventory = await get("/api/equipment");
  assert.equal(inventory.status, 200);
  const cat = inventory.body.categories[0].id;
  await check(
    "API creates real database records, searches, filters, sorts and paginates",
    async () => {
      for (let i = 0; i < 23; i++) {
        const r = await mutate("create", {
          name:
            i === 0
              ? "กล้องทดสอบ Sony FX3"
              : `อุปกรณ์ทดสอบ ${String(i).padStart(2, "0")}`,
          category_id: cat,
          quantity: i === 0 ? 4 : 1,
          purchase_price: 100,
          unit: "ชิ้น",
          initial_status: "available",
        });
        assert.equal(r.status, 200, JSON.stringify(r.body));
      }
      inventory = await get("/api/equipment");
      assert.equal(inventory.body.total, 23);
      assert.equal(inventory.body.equipment.length, 20);
      assert.equal(inventory.body.summary.quantity, 26);
      assert.equal(
        (await get("/api/equipment?page=2")).body.equipment.length,
        3,
      );
      assert.equal((await get("/api/equipment?search=Sony")).body.total, 1);
      assert.equal(
        (await get("/api/equipment?category=" + cat)).body.total,
        23,
      );
      const desc = (await get("/api/equipment?sort=code&direction=desc")).body
        .equipment;
      assert.ok(desc[0].sequence_number > desc[1].sequence_number);
    },
  );
  const eq = (await get("/api/equipment?search=Sony")).body.equipment[0];
  await check(
    "API checkout, partial return, maintenance and details match PostgreSQL counters",
    async () => {
      const c = await mutate("checkout", {
        borrower: "ทีมทดสอบ",
        checkout_date: "2026-11-09",
        expected_return_date: "2026-11-10",
        items: [{ equipment_id: eq.id, quantity: 3 }],
      });
      assert.equal(c.status, 200, JSON.stringify(c.body));
      const list = (await get("/api/equipment?mode=checkouts")).body.checkouts;
      assert.equal(list[0].items[0].quantity, 3);
      const r = await mutate("return", {
        item_id: list[0].items[0].id,
        quantity: 2,
        return_date: "2026-11-10",
        condition: "available",
      });
      assert.equal(r.status, 200);
      const m = await mutate("maintenance_create", {
        equipment_id: eq.id,
        quantity: 1,
        source: "available",
        issue: "ทดสอบส่งซ่อม",
        reported_date: "2026-11-09",
      });
      assert.equal(m.status, 200, JSON.stringify(m.body));
      const detail = (await get("/api/equipment?mode=detail&id=" + eq.id)).body;
      assert.equal(detail.equipment.in_use, 1);
      assert.equal(detail.equipment.maintenance, 1);
      assert.equal(detail.equipment.available, 2);
      assert.equal(detail.returns.length, 1);
    },
  );
  await check(
    "XLSX export opens and preserves Thai and unit asset calculation",
    async () => {
      const r = await fetch(origin + "/api/equipment/export?format=xlsx", {
        headers: headers(admin),
      });
      assert.equal(r.status, 200, await r.clone().text());
      const bytes = Buffer.from(await r.arrayBuffer());
      const book = XLSX.read(bytes);
      const rows = XLSX.utils.sheet_to_json(book.Sheets.Equipment, {
        header: 1,
      });
      assert.equal(rows.length, 24);
      assert.equal(rows[1][1], "กล้องทดสอบ Sony FX3");
      assert.equal(rows[1][14], 400);
    },
  );
  await mkdir("/tmp/pharadol-equipment-qa", { recursive: true });
  await check(
    "PDF export embeds Thai font and generates a real PDF",
    async () => {
      const r = await fetch(
        origin + "/api/equipment/export?format=pdf&search=Sony",
        { headers: headers(admin) },
      );
      assert.equal(r.status, 200, await r.clone().text());
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      await writeFile("/tmp/pharadol-equipment-qa/equipment.pdf", bytes);
    },
  );
  await check(
    "private attachments require authenticated brand access",
    async () => {
      const form = new FormData();
      form.set("equipment_id", eq.id);
      form.set("kind", "receipt");
      form.set(
        "file",
        new Blob(
          [
            await (
              await fetch(
                origin + "/api/equipment/export?format=pdf&search=Sony",
                { headers: headers(admin) },
              )
            ).arrayBuffer(),
          ],
          { type: "application/pdf" },
        ),
        "ใบเสร็จทดสอบ.pdf",
      );
      const r = await fetch(origin + "/api/equipment/files", {
        method: "POST",
        headers: { Cookie: headers(admin).Cookie, Origin: origin },
        body: form,
      });
      const b = await r.json();
      assert.equal(r.status, 200, JSON.stringify(b));
      assert.equal(
        (await fetch(origin + "/api/equipment/files?id=" + b.document.id))
          .status,
        401,
      );
      assert.equal(
        (
          await get("/api/equipment/files?id=" + b.document.id, {
            ...admin,
            brands: ["adisorn"],
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(origin + "/api/equipment/files?id=" + b.document.id, {
            headers: headers(admin),
          })
        ).status,
        200,
      );
    },
  );
  browser = await puppeteer.launch({
    headless: true,
    executablePath: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find((p) => existsSync(p)),
  });
  await check(
    "browser scans printed QR, logs in using the unchanged form, returns to Overview and reopens directly",
    async () => {
      const context = await browser.createBrowserContext();
      const qrPage = await context.newPage();
      try {
        await qrPage.goto(origin + "/pharadol/equipment", {
          waitUntil: "networkidle0",
        });
        assert.equal(new URL(qrPage.url()).pathname, "/login");
        await qrPage.type("#login-identifier", "admin");
        await qrPage.type("#login-password", "equipment-only-test-password");
        await qrPage.click('button[type="submit"]');
        await qrPage.waitForFunction(
          () => location.pathname === "/pharadol/equipment",
        );
        await qrPage.waitForSelector("h1");
        assert.equal(
          await qrPage.$eval("h1", (e) => e.textContent),
          "Equipment",
        );
        await qrPage.goto(origin + "/pharadol/equipment", {
          waitUntil: "networkidle0",
        });
        assert.equal(new URL(qrPage.url()).pathname, "/pharadol/equipment");
        assert.equal(
          await qrPage.$eval("h1", (e) => e.textContent),
          "Equipment",
        );
        assert.equal(
          await qrPage.evaluate(() => sessionStorage.getItem("activeBrand")),
          "pharadol",
        );
      } finally {
        await context.close();
      }
    },
  );
  const page = await browser.newPage();
  // Local storage adapter has a loopback origin; Production uses the existing allowed Supabase domain.
  await page.setBypassCSP(true);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setCookie({
    name: "booking_session",
    value: token(admin),
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  await page.evaluateOnNewDocument((user) => {
    sessionStorage.setItem("loggedIn", "true");
    sessionStorage.setItem("currentUser", JSON.stringify(user));
    sessionStorage.setItem(
      "activeBrand",
      location.pathname.startsWith("/adisorn") ? "adisorn" : "pharadol",
    );
    sessionStorage.setItem("lastActivity", String(Date.now()));
  }, admin);
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (
      u.origin === origin &&
      u.pathname.startsWith("/api/") &&
      !u.pathname.startsWith("/api/equipment")
    ) {
      if (u.pathname === "/api/auth/session")
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            user: admin,
            activeBrand: (req.headers()["referer"] || "").includes("/adisorn/")
              ? "adisorn"
              : "pharadol",
          }),
        });
      return req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          bookings: [],
          members: [],
          requests: [],
          total: 0,
        }),
      });
    }
    return req.continue();
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(origin + "/pharadol/equipment", {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(() =>
    document.body.innerText.includes("กล้องทดสอบ Sony FX3"),
  );
  await check(
    "desktop inventory renders with active Equipment navigation and no overflow",
    async () => {
      assert.equal(await page.$eval("h1", (e) => e.textContent), "Equipment");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.ok(await page.$('a[href="/pharadol/equipment"]'));
      await page.screenshot({
        path: "/tmp/pharadol-equipment-qa/desktop.png",
        fullPage: true,
      });
    },
  );
  async function clickText(text) {
    await page.waitForFunction(text => [...document.querySelectorAll("button")].some(b => b.textContent.trim() === text && b.offsetParent !== null), { timeout: 10000 }, text);
    const found = await page.evaluate((text) => {
      const buttons = [...document.querySelectorAll("button")].filter(
        (b) => b.textContent.trim() === text && b.offsetParent !== null,
      );
      const b = buttons[0];
      b?.click();
      return !!b;
    }, text);
    assert.ok(found, "Button not found: " + text);
  }
  await check(
    "browser creates equipment through form → API → PostgreSQL → refreshed table",
    async () => {
      await clickText("+ Add Equipment");
      await page.waitForSelector("dialog[open] input[name=name]");
      await page.type("dialog[open] input[name=name]", "สร้างผ่านหน้าเว็บ");
      await page.select("dialog[open] select[name=category_id]", cat);
      await page.click("dialog[open] button[type=submit]");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      const row = (
        await db.pool.query(
          "SELECT name FROM equipment WHERE name='สร้างผ่านหน้าเว็บ'",
        )
      ).rows[0];
      assert.ok(row);
    },
  );
  await check(
    "mobile page and add form fit 390px with accessible dialog",
    async () => {
      await page.setViewport({
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      });
      await delay(200);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: "/tmp/pharadol-equipment-qa/mobile.png",
        fullPage: true,
      });
      await clickText("+ Add Equipment");
      assert.equal(
        await page.$eval("dialog[open]", (d) => d.scrollWidth <= d.clientWidth),
        true,
      );
      assert.ok(await page.$("dialog[open][aria-labelledby]"));
      await page.screenshot({
        path: "/tmp/pharadol-equipment-qa/mobile-form.png",
        fullPage: false,
      });
      await page.keyboard.press("Escape");
    },
  );
  const imageDir = "/tmp/pharadol-equipment-qa/images";
  await mkdir(imageDir, { recursive: true });
  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#57776a" },
  })
    .jpeg()
    .toBuffer();
  for (let n = 0; n < 6; n++)
    await writeFile(
      `${imageDir}/${n}.jpg`,
      await sharp({
        create: {
          width: 900,
          height: 600,
          channels: 3,
          background: [
            "#57776a",
            "#d2bb92",
            "#a9c4cb",
            "#b68f91",
            "#d2d5bd",
            "#5e6380",
          ][n],
        },
      })
        .jpeg()
        .toBuffer(),
    );
  await writeFile(`${imageDir}/bad.svg`, "<svg/>");
  await writeFile(`${imageDir}/large.jpg`, Buffer.alloc(10485761));
  const imagePost = async (payload, user = admin) => {
    const r = await fetch(origin + "/api/equipment/images", {
      method: "POST",
      headers: headers(user),
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json() };
  };
  await check(
    "image API enforces access, 10 MB direct uploads, authentic decode and staging cleanup",
    async () => {
      const draft = randomUUID();
      const prepare = {
        action: "prepare",
        draft_id: draft,
        filename: "large-valid.jpg",
        mime_type: "image/jpeg",
        size: photo.length + 6 * 1024 * 1024,
      };
      assert.equal(
        (
          await fetch(origin + "/api/equipment/images", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: origin },
            body: JSON.stringify(prepare),
          })
        ).status,
        401,
      );
      for (const user of [
        { ...admin, brands: ["adisorn"] },
        { ...admin, role: "VIEWER" },
      ])
        assert.equal((await imagePost(prepare, user)).status, 403);
      const prepared = await imagePost(prepare);
      assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
      const raw = Buffer.concat([photo, Buffer.alloc(6 * 1024 * 1024)]);
      assert.equal(
        (
          await fetch(prepared.body.upload_url, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: raw,
          })
        ).status,
        200,
      );
      assert.equal(
        (await imagePost({ action: "complete", id: prepared.body.id })).status,
        200,
      );
      const staged = await fetch(
        origin + "/api/equipment/images?id=" + prepared.body.id,
        { headers: headers(admin) },
      );
      assert.equal(staged.status, 200);
      assert.equal(staged.headers.get("content-type"), "image/webp");
      const other = { ...admin, id: "other-image-user", username: "Other" };
      assert.equal(
        (
          await fetch(origin + "/api/equipment/images?id=" + prepared.body.id, {
            headers: headers(other),
          })
        ).status,
        404,
      );
      assert.equal(
        (await imagePost({ action: "complete", id: prepared.body.id }, other))
          .status,
        404,
      );
      await imagePost({ action: "cancel", id: prepared.body.id });
      assert.equal(
        [...backend.objects.keys()].some((k) => k.includes(prepared.body.id)),
        false,
      );
      for (const [filename, mime_type, size] of [
        ["a.pdf", "application/pdf", 100],
        ["a.heic", "image/heic", 100],
        ["a.jpg", "image/jpeg", 10485761],
      ])
        assert.equal(
          (
            await imagePost({
              action: "prepare",
              draft_id: draft,
              filename,
              mime_type,
              size,
            })
          ).status,
          400,
        );
      const bad = await imagePost({
        action: "prepare",
        draft_id: draft,
        filename: "spoof.jpg",
        mime_type: "image/jpeg",
        size: 7,
      });
      await fetch(bad.body.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: "not-jpg",
      });
      assert.equal(
        (await imagePost({ action: "complete", id: bad.body.id })).status,
        400,
      );
      assert.equal(
        [...backend.objects.keys()].some((k) => k.includes(bad.body.id)),
        false,
      );
    },
  );
  const editor = 'section[aria-label="Equipment Images · รูปภาพอุปกรณ์"]';
  const input = () => page.$(`${editor} input[type=file]`);
  async function waitReady(n) {
    await page.waitForFunction(
      (selector, n) => {
        const el = document.querySelector(selector);
        return (
          el &&
          [...el.querySelectorAll("article")].filter((a) =>
            a.innerText.includes("พร้อมบันทึก"),
          ).length === n
        );
      },
      { timeout: 30000 },
      editor,
      n,
    );
  }
  async function editorClick(n, text) {
    await page.evaluate(
      (selector, n, text) => {
        const a = document.querySelectorAll(selector + " article")[n];
        const b = [...a.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === text,
        );
        if (!b) throw Error("image action missing " + text);
        b.click();
      },
      editor,
      n,
      text,
    );
  }
  let imageEquipment;
  await check(
    "Add form previews one/five images, rejects overflow/type/size, preserves fields and saves selected cover",
    async () => {
      await page.setViewport({
        width: 1440,
        height: 1000,
        isMobile: false,
        hasTouch: false,
      });
      await page.goto(origin + "/pharadol/equipment", {
        waitUntil: "networkidle0",
      });
      await clickText("+ Add Equipment");
      await page.type("dialog[open] input[name=name]", "ภาพอุปกรณ์ UI");
      await page.select("dialog[open] select[name=category_id]", cat);
      await (await input()).uploadFile(`${imageDir}/0.jpg`);
      await page.waitForSelector(`${editor} img[src^="blob:"]`);
      assert.equal(
        await page.$eval("dialog[open] input[name=name]", (el) => el.value),
        "ภาพอุปกรณ์ UI",
      );
      await waitReady(1);
      const dropFiles = await Promise.all(
        [1, 2, 3, 4].map(async (n) => ({
          name: `${n}.jpg`,
          base64: (await readFile(`${imageDir}/${n}.jpg`)).toString("base64"),
        })),
      );
      await page.evaluate(
        (selector, files) => {
          const dt = new DataTransfer();
          for (const f of files)
            dt.items.add(
              new File(
                [Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))],
                f.name,
                { type: "image/jpeg" },
              ),
            );
          document
            .querySelector(selector + " > button")
            .dispatchEvent(
              new DragEvent("drop", {
                dataTransfer: dt,
                bubbles: true,
                cancelable: true,
              }),
            );
        },
        editor,
        dropFiles,
      );
      await waitReady(5);
      assert.ok(
        (await page.$eval(editor, (el) => el.innerText)).includes(
          "5 / 5 Images",
        ),
      );
      await (await input()).uploadFile(`${imageDir}/5.jpg`);
      assert.ok(
        (await page.$eval(editor, (el) => el.innerText)).includes("สูงสุด 5"),
      );
      await editorClick(3, "ตั้งเป็นรูปหลัก");
      await editorClick(3, "ลบรูป");
      await waitReady(4);
      assert.ok(
        await page.$eval(`${editor} article`, (el) =>
          el.innerText.includes("รูปหลัก"),
        ),
      );
      await (await input()).uploadFile(`${imageDir}/bad.svg`);
      assert.ok(
        (await page.$eval(editor, (el) => el.innerText)).includes(
          "รองรับรูปภาพ",
        ),
      );
      await (await input()).uploadFile(`${imageDir}/large.jpg`);
      assert.ok(
        (await page.$eval(editor, (el) => el.innerText)).includes("10 MB"),
      );
      const [cancelPicker] = await Promise.all([
        page.waitForFileChooser(),
        editorClick(0, "เปลี่ยนรูป"),
      ]);
      await cancelPicker.cancel();
      assert.equal(
        await page.$eval("dialog[open] input[name=name]", (el) => el.value),
        "ภาพอุปกรณ์ UI",
      );
      const [replacePicker] = await Promise.all([
        page.waitForFileChooser(),
        editorClick(0, "เปลี่ยนรูป"),
      ]);
      await replacePicker.accept([`${imageDir}/5.jpg`]);
      await waitReady(4);
      await (await input()).uploadFile(`${imageDir}/3.jpg`);
      await waitReady(5);
      await editorClick(2, "ตั้งเป็นรูปหลัก");
      await page.screenshot({
        path: "/tmp/pharadol-equipment-qa/images-form-desktop.png",
        fullPage: false,
      });
      await page.click("dialog[open] button[type=submit]");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      imageEquipment = (
        await db.pool.query(
          "SELECT * FROM equipment WHERE name='ภาพอุปกรณ์ UI'",
        )
      ).rows[0];
      assert.ok(imageEquipment);
      const photos = (
        await db.pool.query(
          "SELECT * FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL ORDER BY sort_order",
          [imageEquipment.id],
        )
      ).rows;
      assert.equal(photos.length, 5);
      assert.equal(photos.filter((p) => p.is_cover).length, 1);
      assert.equal(photos[2].is_cover, true);
      assert.equal(imageEquipment.quantity, 1);
      assert.equal(imageEquipment.available, 1);
    },
  );
  await check(
    "inventory image, Details gallery, enlarge/next/previous/close and Mobile render stored images",
    async () => {
      await page.setViewport({
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      });
      await page.goto(origin + "/pharadol/equipment", {
        waitUntil: "networkidle0",
      });
      await page.type(
        'input[placeholder="ชื่อ รหัส ยี่ห้อ รุ่น หรือ Serial"]',
        "ภาพอุปกรณ์ UI",
      );
      await page.waitForSelector(
        `button[aria-label="ดูรูปภาพ ภาพอุปกรณ์ UI"] img`,
      );
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            'button[aria-label="ดูรูปภาพ ภาพอุปกรณ์ UI"] img',
          ),
        ].some((i) => i.complete && i.naturalWidth > 0),
      );
      await page.evaluate(() => [...document.querySelectorAll('button[aria-label="ดูรูปภาพ ภาพอุปกรณ์ UI"]')].find(el => el.offsetParent !== null).click());
      await page.waitForSelector('dialog[aria-label="ดูรูปภาพอุปกรณ์"][open]');
      await page.click('button[aria-label="ปิดรูปภาพ"]');
      await clickText("ภาพอุปกรณ์ UI");
      await page.waitForSelector(
        'dialog[open] button[aria-label="เปิดรูป 2 "]',
      );
      await page.click('dialog[open] button[aria-label="เปิดรูป 2 "]');
      await page.waitForSelector('dialog[aria-label="ดูรูปภาพอุปกรณ์"][open]');
      await clickText("รูปถัดไป →");
      await clickText("← รูปก่อนหน้า");
      await page.keyboard.press("Escape");
      assert.equal(
        await page.$('dialog[aria-label="ดูรูปภาพอุปกรณ์"][open]'),
        null,
      );
      assert.ok(await page.$("dialog[open]"));
      assert.equal(
        await page.$eval(
          "dialog[open]",
          (el) => el.scrollWidth <= el.clientWidth,
        ),
        true,
      );
      await page.screenshot({
        path: "/tmp/pharadol-equipment-qa/images-gallery-mobile.png",
        fullPage: false,
      });
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Edit image cancel preserves originals; saved deletion/reorder/cover retain stock and history",
    async () => {
      const before = (
        await db.pool.query(
          "SELECT * FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL ORDER BY sort_order",
          [imageEquipment.id],
        )
      ).rows;
      async function edit() {
        await clickText("ภาพอุปกรณ์ UI");
        await page.waitForSelector("dialog[open]");
        await clickText("แก้ไขข้อมูล");
        await page.waitForSelector(editor + " article");
        await waitReady(5);
      }
      await edit();
      await editorClick(2, "ลบรูป");
      await page.keyboard.press("Escape");
      assert.equal(
        (
          await db.pool.query(
            "SELECT count(*) FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL",
            [imageEquipment.id],
          )
        ).rows[0].count,
        "5",
      );
      // Close the underlying Details dialog before opening a fresh editor.
      await page.keyboard.press("Escape");
      await edit();
      await editorClick(2, "ลบรูป");
      await page.click(`${editor} button[aria-label="เลื่อนรูป 1 ไปถัดไป"]`);
      await page.click("dialog[open] button[type=submit]");
      await page.waitForFunction(
        () => !document.querySelector("dialog[open] input[name=name]"),
      );
      const after = (
        await db.pool.query("SELECT * FROM equipment WHERE id=$1", [
          imageEquipment.id,
        ])
      ).rows[0];
      for (const col of [
        "id",
        "equipment_code",
        "quantity",
        "available",
        "in_use",
        "maintenance",
        "damaged",
        "retired",
        "status",
      ])
        assert.equal(after[col], imageEquipment[col]);
      const images = (
        await db.pool.query(
          "SELECT * FROM equipment_images WHERE equipment_id=$1 AND deleted_at IS NULL ORDER BY sort_order",
          [imageEquipment.id],
        )
      ).rows;
      assert.equal(images.length, 4);
      assert.equal(images.filter((p) => p.is_cover).length, 1);
      assert.equal(images[0].id, before[1].id);
      assert.ok(
        backend.objects.has("equipment-images/" + before[2].storage_path),
        "Old photo remains private after metadata commit",
      );
      assert.equal(
        (
          await fetch(origin + "/api/equipment/images?id=" + before[2].id, {
            headers: headers(admin),
          })
        ).status,
        404,
      );
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "cancelled drafts and expired upload tokens clean files without creating permanent equipment",
    async () => {
      const before = (await db.pool.query("SELECT count(*) FROM equipment"))
        .rows[0].count;
      await clickText("+ Add Equipment");
      await (await input()).uploadFile(`${imageDir}/0.jpg`);
      await waitReady(1);
      const image = (
        await db.pool.query(
          "SELECT id FROM equipment_image_uploads WHERE status='ready' ORDER BY created_at DESC LIMIT 1",
        )
      ).rows[0];
      await page.keyboard.press("Escape");
      for (let i = 0; i < 30; i++) {
        if (![...backend.objects.keys()].some((k) => k.includes(image.id)))
          break;
        await delay(100);
      }
      assert.equal(
        [...backend.objects.keys()].some((k) => k.includes(image.id)),
        false,
      );
      assert.equal(
        (await db.pool.query("SELECT count(*) FROM equipment")).rows[0].count,
        before,
      );
      await db.pool.query(
        "UPDATE equipment_image_uploads SET expires_at=now()-interval '11 minutes' WHERE status='cancelled'",
      );
      assert.equal((await imagePost({ action: "cleanup" })).status, 200);
      assert.equal(
        (
          await db.pool.query(
            "SELECT count(*) FROM equipment_image_uploads WHERE status='cancelled'",
          )
        ).rows[0].count,
        "0",
      );
    },
  );
  await check("Adisorn navigation never shows the Equipment menu", async () => {
    await page.goto(origin + "/adisorn/dashboard", {
      waitUntil: "networkidle0",
    });
    assert.equal(await page.$('a[href="/adisorn/equipment"]'), null);
    assert.equal(await page.$('a[href="/pharadol/equipment"]'), null);
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: results.length,
        checks: results,
        artifacts: "/tmp/pharadol-equipment-qa",
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  if (browser) {
    const pages = await browser.pages();
    await pages
      .at(-1)
      ?.screenshot({ path: "/tmp/pharadol-equipment-qa/images-failure.png" })
      .catch(() => {});
  }
  await writeFile("/tmp/pharadol-equipment-browser.log", logs);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (app) {
    app.kill("SIGTERM");
    await new Promise((resolve) => {
      app.once("exit", resolve);
      setTimeout(resolve, 3000).unref();
    });
  }
  await backend.close();
  await db.close();
}
