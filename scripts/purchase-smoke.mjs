import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";
import { startEquipmentTestDatabase } from "./equipment-test-db.mjs";
import { migratePurchase, startPurchaseStub } from "../tests/purchase/fixtures.mjs";

const secret = randomUUID() + randomUUID();
const approvalSecret = randomUUID() + randomUUID();
const admin = {
  id: "local-purchase-tester", username: "tester", name: "ผู้ขอจัดซื้อทดสอบ", email: "proposer@example.invalid",
  role: "BRAND_ADMIN", brands: ["pharadol", "adisorn"], active: true,
};
function token(user) {
  const body = Buffer.from(JSON.stringify({ type: "session", user, exp: Math.floor(Date.now() / 1000) + 1800 })).toString("base64url");
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}

const temporary = createServer();
temporary.listen(0, "127.0.0.1");
await once(temporary, "listening");
const { port } = temporary.address();
await new Promise((resolve) => temporary.close(resolve));
const origin = `http://localhost:${port}`;
const api = "/api/purchase";
const root = api + "/pharadol";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAE0lEQVR4nGNQKowhiBhGFQ1GRQB9CIZxnqDLJwAAAABJRU5ErkJggg==", "base64");
const quote = Buffer.from("%PDF-1.4\n% smoke fixture\n%%EOF\n");
const documentId = randomUUID();
const itemId = randomUUID();
const items = Array.from({ length: 36 }, (_, position) => ({
  id: position === 0 ? itemId : randomUUID(), name: `อุปกรณ์ทดสอบ ${position + 1}`,
  description: "อุปกรณ์สำหรับตรวจสอบเอกสารหลายหน้าและการตัดบรรทัดภาษาไทย", quantity: "1", unit: "ชิ้น",
  unit_price: "10.25", notes: "",
}));
const fixture = await startEquipmentTestDatabase();
let stub, app, browser, output = "";

function cookie(name, value) {
  return name + "=" + value;
}
const session = cookie("booking_session", token(admin));
async function http(path, { method = "GET", auth = session, body, type, expected = 200, redirect = "manual", ...rest } = {}) {
  const headers = { ...(auth ? { Cookie: auth } : {}), ...(method === "GET" ? {} : { Origin: origin }),
    ...(type || body !== undefined ? { "Content-Type": type || "application/json" } : {}), ...rest.headers };
  const response = await fetch(origin + path, { method, headers, redirect,
    ...(body !== undefined ? { body: type ? body : JSON.stringify(body) } : {}) });
  if (response.status !== expected) {
    const error = await response.clone().text();
    throw new Error(`${method} ${path.split("?")[0].replace(/\/invite\/.+/, "/invite/[redacted]")} returned ${response.status}; expected ${expected} — ${error.slice(0, 450)}`);
  }
  return response;
}
const get = async (path, options) => (await http(path, options)).json();
const post = async (path, body, options) => (await http(path, { method: "POST", body, ...options })).json();
const foundMail = (predicate) => [...stub.mail.values()].map((entry) => entry.body).findLast(predicate);
const invitation = (email) => new URL(foundMail((message) => message.to[0] === email && message.html).text.match(/https?:\/\/\S+/)[0]).pathname;
function readCookie(response, name) {
  const raw = response.headers.getSetCookie().find((line) => line.startsWith(name + "="));
  assert.ok(raw?.includes("Secure") && raw?.includes("HttpOnly") && raw?.toLowerCase().includes("samesite=strict"));
  return raw.split(";")[0];
}
async function reviewer(mailbox) {
  const link = await http(invitation(mailbox), { auth: "", expected: 303 });
  assert.equal(new URL(link.headers.get("location")).pathname, "/purchase-review");
  const cookie = readCookie(link, "__Host-purchase-invite");
  assert.equal((await get(api + "/review", { auth: cookie })).stage, "otp");
  await post(api + "/review/request", {}, { auth: cookie });
  const pin = foundMail((message) => message.to[0] === mailbox && /OTP/.test(message.text)).text.match(/\b\d{6}\b/)[0];
  await post(api + "/review/verify", { code: pin === "111111" ? "222222" : "111111" }, { auth: cookie, expected: 400 });
  const login = await http(api + "/review/verify", { method: "POST", body: { code: pin }, auth: cookie });
  return cookie + "; " + readCookie(login, "__Host-purchase-review");
}

try {
  await migratePurchase(fixture.pool);
  stub = await startPurchaseStub(fixture.pool);
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || "/tmp", NEXT_TELEMETRY_DISABLED: "1",
      AUTH_SECRET: secret, NEXT_PUBLIC_SUPABASE_URL: stub.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon",
      SUPABASE_SERVICE_ROLE_KEY: "local-purchase-only", PURCHASE_SUPABASE_URL: stub.url,
      PURCHASE_SUPABASE_SERVICE_ROLE_KEY: "local-purchase-only", PURCHASE_APP_URL: origin, PURCHASE_SECRET: approvalSecret,
      PHARADOL_EMAIL_FROM: "Team <sender@example.invalid>", ADISORN_EMAIL_FROM: "Studio <sender@example.invalid>",
      PURCHASE_RESEND_API_KEY: "local-purchase-only", PURCHASE_SMOKE_STUB: stub.url, PURCHASE_TEST_EMAIL: "",
      NODE_OPTIONS: "--import=" + join(process.cwd(), "tests/purchase/mail-transport.mjs"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (data) => { output += data; });
  app.stderr.on("data", (data) => { output += data; });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin + "/login")).ok) break; } catch {}
    if (attempt === 100 || app.exitCode !== null) throw new Error("Next.js did not start. Run npm run build first.");
    await delay(200);
  }

  await http(root, { auth: "", expected: 401 });
  const pharadolOnly = cookie("booking_session", token({ ...admin, brands: ["pharadol"] }));
  await http(api + "/adisorn", { auth: pharadolOnly, expected: 403 });
  await http(root, { method: "POST", body: {}, expected: 403, headers: { Origin: "https://unrelated.invalid" } });
  const newDoc = await post(root, { id: documentId, purpose: "ทดสอบใบตั้งเบิกภาษาไทย", reason: "ตรวจเอกสารหลายหน้า",
    needed_on: "24/11/2569", shipping: "40.00", discount: "9.00", vat: "0", items }, { expected: 201 });
  const path = root + "/" + newDoc.id;
  const attach = async (kind, name, bytes, type, version, item = "") => {
    const query = new URLSearchParams({ kind, name, version, item });
    return post(path + "/files?" + query, bytes, { type, expected: 201 });
  };
  const photo = await attach("product", "สินค้า.png", png, "image/png", newDoc.version, itemId);
  const quotation = await attach("quotation", "ใบเสนอราคา.pdf", quote, "application/pdf", photo.version);
  assert.deepEqual(Buffer.from(await (await http(path + "/files/" + photo.file_id)).arrayBuffer()), png);
  await http(path + "/files/" + quotation.file_id, { auth: "", expected: 401 });
  await http(api + "/adisorn/" + newDoc.id, { expected: 404 });
  assert.equal((await get(path)).document.total, "400.00");

  const approvers = [
    { level: 1, name: "หัวหน้างานทดสอบ", position: "หัวหน้างาน", email: "first@example.invalid", active: true },
    { level: 2, name: "ผู้บริหารทดสอบ", position: "ผู้บริหาร", email: "executive@example.invalid", active: true },
  ];
  for (const approver of approvers) await post(root + "/approvers", approver);
  stub.failNextEmail();
  await post(path + "/submit", { version: quotation.version });
  const submitted = await get(path);
  assert.equal(submitted.document.status, "pending");
  assert.equal(submitted.mail[0].status, "failed");
  const job = submitted.mail[0].id;
  await Promise.all([post(path + "/retry", { id: job }), post(path + "/retry", { id: job })]);
  assert.equal(stub.mail.size, 1);

  const reviewer1 = await reviewer(approvers[0].email);
  const review = await get(api + "/review", { auth: reviewer1 });
  assert.equal(review.data.document.id, documentId);
  assert.equal(review.data.items.length, items.length);
  await http(api + "/review/files/" + quotation.file_id, { auth: reviewer1 });
  await http(api + "/review/files/" + randomUUID(), { auth: reviewer1, expected: 404 });
  await post(api + "/review/decision", { decision: "approved", comment: "ตรวจสอบแล้ว" }, { auth: reviewer1 });
  await post(api + "/review/decision", { decision: "approved" }, { auth: reviewer1, expected: 403 });
  assert.ok(foundMail((message) => message.to[0] === admin.email && /ตรวจสอบแล้ว/.test(message.text)));
  const reviewer2 = await reviewer(approvers[1].email);
  await post(api + "/review/decision", { decision: "approved" }, { auth: reviewer2 });
  const approved = await get(path);
  assert.equal(approved.document.status, "approved");
  const buying = await post(path + "/start", { version: approved.document.version });
  const receipt = await attach("receipt", "ใบเสร็จ.png", png, "image/png", buying.version);
  await post(path + "/payment", { version: receipt.version, actual_total: "395", paid_on: "2026-11-24", purchased_on: "2026-11-24",
    method: "โอนเงิน", vendor: "ร้านค้าทดสอบ", receipt_id: receipt.file_id, receipt_number: "TEST-001" });
  const completed = await get(path);
  assert.equal(completed.document.status, "completed");
  assert.equal(completed.payments[0].difference, "-5.00");
  const options = await get(path + "/inventory");
  const input = { items: [{ item_id: itemId, category_id: options.categories[0].id, unit_price: "10.00", serial_number: "SMOKE-EQ" }] };
  const inventory = await post(path + "/inventory", input);
  assert.equal(inventory.links.length, 1);
  assert.deepEqual((await post(path + "/inventory", input)).links, inventory.links);
  const pdf = await http(path + "/pdf");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.ok((bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length >= 2);
  if (process.env.PURCHASE_SMOKE_PDF) await writeFile(process.env.PURCHASE_SMOKE_PDF, bytes);
  console.log("PASS HTTP roles, brands, files, email retry, OTP, decisions, payment, inventory and multi-page PDF");

  const chrome = [process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((name) => name && existsSync(name));
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 });
  await page.browserContext().setCookie({ name: "booking_session", value: token(admin), url: origin, httpOnly: true });
  await page.evaluateOnNewDocument((user) => {
    sessionStorage.setItem("activeBrand", "pharadol");
    sessionStorage.setItem("loggedIn", "true");
    sessionStorage.setItem("lastActivity", String(Date.now()));
    sessionStorage.setItem("currentUser", JSON.stringify(user));
    localStorage.setItem("central_admin_users", JSON.stringify([user]));
  }, admin);
  page.on("pageerror", (error) => { output += "Browser error: " + error.message + "\n"; });
  await page.goto(origin + "/pharadol/purchase/" + newDoc.id);
  await page.waitForSelector(".pr-document", { timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("img")].some((image) =>
    image.src.includes("/files/") && image.complete && image.naturalWidth > 0));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.waitForFunction(() => document.querySelector(".pr-document")?.textContent.includes("ทดสอบใบตั้งเบิกภาษาไทย"));
  await page.goto(origin + "/pharadol/purchase/new");
  await page.waitForFunction(() => document.body.textContent.includes("บันทึกใบตั้งเบิก"));
  const add = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("เพิ่มสินค้า")));
  await add.asElement().click();
  await page.waitForFunction(() => document.body.textContent.includes("รายการที่ 2"));
  await page.goto(origin + "/pharadol");
  try {
    await page.waitForSelector(".booking-form-panel", { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector(".print-area")?.textContent.includes("ใบสำคัญการจอง"));
  } catch (error) {
    output += "Legacy booking browser state: " + new URL(page.url()).pathname + " " +
      (await page.evaluate(() => document.body.innerText.slice(0, 250))) + "\n";
    throw error;
  }
  console.log("PASS mobile document, image, new form with multiple lines and legacy booking entry");
} catch (error) {
  if (output) console.error(output.slice(-2000));
  throw error;
} finally {
  await browser?.close();
  if (app?.exitCode === null) { app.kill("SIGINT"); await once(app, "exit"); }
  await stub?.close();
  await fixture.close();
}
