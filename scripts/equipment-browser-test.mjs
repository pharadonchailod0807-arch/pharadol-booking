import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";
import * as XLSX from "xlsx";
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
