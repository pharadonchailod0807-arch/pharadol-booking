import "server-only";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { documentHtml, selectDocument } from "./document";
import { downloadFile } from "./server";

const dataUrl = (buffer, mime) => `data:${mime};base64,${buffer.toString("base64")}`;

async function openBrowser() {
  if (process.env.VERCEL_ENV) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: "shell" });
  }
  const chrome = [process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find((name) => name && existsSync(name));
  if (chrome) return puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
  return (await import("puppeteer")).default.launch({ headless: true, args: ["--no-sandbox"] });
}

async function thumbnail(page, brand, requisition, file) {
  const blob = await downloadFile(brand, requisition, file);
  const data = dataUrl(Buffer.from(await blob.arrayBuffer()), file.mime);
  return page.evaluate(async (source) => {
    const picture = new Image();
    picture.src = source;
    try {
      await picture.decode();
    } catch {
      return "";
    }
    const scale = Math.min(1, 200 / Math.max(picture.naturalWidth, picture.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75);
  }, data);
}

export async function exportPurchasePdf(fullData) {
  const data = selectDocument(fullData, true);
  const doc = data.document;
  const [css, font, logo] = await Promise.all([
    readFile(join(process.cwd(), "public/purchase/document.css"), "utf8"),
    readFile(join(process.cwd(), "public/equipment/NotoSansThai.ttf")),
    doc.brand === "adisorn" ? readFile(join(process.cwd(), "public/adisorn-logo.png"))
      : readFile(join(process.cwd(), "public/pharadol-logo.jpeg")),
  ]);
  const browser = await openBrowser();
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void (request.url().startsWith("data:") ? request.continue() : request.abort());
    });
    const pictures = data.files.filter((file) => file.kind === "product");
    const images = new Map();
    for (let i = 0; i < pictures.length; i += 4) {
      await Promise.all(pictures.slice(i, i + 4).map(async (file) => {
        images.set(file.id, await thumbnail(page, doc.brand, doc.id, file));
      }));
    }
    const contents = documentHtml(data, {
      logo: dataUrl(logo, doc.brand === "adisorn" ? "image/png" : "image/jpeg"),
      image: (file) => images.get(file.id),
      print: true,
    });
    const style = css.replace("/equipment/NotoSansThai.ttf", dataUrl(font, "font/ttf"));
    await page.setContent(`<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${style}</style></head><body>${contents}</body></html>`,
      { waitUntil: "load", timeout: 15000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "13mm", right: "13mm" }, timeout: 20000 });
    return new Response(pdf, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } finally {
    await browser.close();
  }
}
