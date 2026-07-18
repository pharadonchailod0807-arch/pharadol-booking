import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import puppeteerCore from "puppeteer-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cachedChromiumPath = "";
let chromiumDownloadPromise = null;
let sharedBrowserPromise = null;
let latestPdfCache = null;

const PDF_CACHE_TTL_MS = 10 * 60 * 1000;

const sanitizeFilename = (value) => {
  const cleaned = String(value || "booking.pdf")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : `${cleaned || "booking"}.pdf`;
};

const createPdfResponse = (pdfBuffer, filename) =>
  new Response(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });

const getLocalChromePath = () => {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((path) => existsSync(path)) || "";
};

const getVercelChromiumPath = async (packUrl) => {
  if (cachedChromiumPath) {
    return cachedChromiumPath;
  }

  if (!chromiumDownloadPromise) {
    chromiumDownloadPromise = import(
      "@sparticuz/chromium-min"
    )
      .then(({ default: chromium }) =>
        chromium.executablePath(packUrl)
      )
      .then((path) => {
        cachedChromiumPath = path;
        return path;
      })
      .catch((error) => {
        chromiumDownloadPromise = null;
        throw error;
      });
  }

  return chromiumDownloadPromise;
};

const launchBrowser = async (requestOrigin) => {
  const isVercel = Boolean(process.env.VERCEL_ENV);

  if (isVercel) {
    const { default: chromium } = await import(
      "@sparticuz/chromium-min"
    );

    const executablePath =
      await getVercelChromiumPath(
        `${requestOrigin}/chromium-pack.tar`
      );

    return puppeteerCore.launch({
      args: chromium.args,
      executablePath,
      headless: true,
      defaultViewport: {
        width: 1280,
        height: 1600,
        deviceScaleFactor: 1,
      },
    });
  }

  const localChromePath = getLocalChromePath();

  if (localChromePath) {
    return puppeteerCore.launch({
      executablePath: localChromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
      defaultViewport: {
        width: 1280,
        height: 1600,
        deviceScaleFactor: 1,
      },
    });
  }

  const puppeteer = await import("puppeteer");

  return puppeteer.default.launch({
    headless: true,
    defaultViewport: {
      width: 1280,
      height: 1600,
      deviceScaleFactor: 1,
    },
  });
};

const getSharedBrowser = async (requestOrigin) => {
  if (sharedBrowserPromise) {
    try {
      const existingBrowser =
        await sharedBrowserPromise;

      if (existingBrowser?.connected) {
        return existingBrowser;
      }
    } catch {
      // เปิด Browser ใหม่ด้านล่าง
    }

    sharedBrowserPromise = null;
  }

  const launchPromise = launchBrowser(requestOrigin);
  sharedBrowserPromise = launchPromise;

  try {
    const browser = await launchPromise;

    browser.once("disconnected", () => {
      if (sharedBrowserPromise === launchPromise) {
        sharedBrowserPromise = null;
      }
    });

    return browser;
  } catch (error) {
    if (sharedBrowserPromise === launchPromise) {
      sharedBrowserPromise = null;
    }

    throw error;
  }
};

export async function POST(request) {
  let browserContext;

  try {
    const payload = await request.json();
    const html = String(payload?.html || "");
    const suppliedOrigin = String(payload?.origin || "");
    const filename = sanitizeFilename(payload?.filename);

    if (!html || html.length < 100) {
      return Response.json(
        { error: "ไม่พบข้อมูลเอกสารสำหรับสร้าง PDF" },
        { status: 400 }
      );
    }

    if (html.length > 4_000_000) {
      return Response.json(
        {
          error:
            "ข้อมูลเอกสารมีขนาดใหญ่เกินไป กรุณาลดขนาดรูปสลิปแล้วลองใหม่",
        },
        { status: 413 }
      );
    }

    const requestOrigin = new URL(request.url).origin;

    let documentOrigin;

    try {
      documentOrigin = new URL(suppliedOrigin).origin;
    } catch {
      return Response.json(
        { error: "ที่อยู่เว็บไซต์สำหรับสร้าง PDF ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const requestHost =
      request.headers.get("host") || "";

    const documentHost =
      new URL(documentOrigin).host;

    if (
      documentOrigin !== requestOrigin &&
      documentHost !== requestHost
    ) {
      return Response.json(
        { error: "ไม่อนุญาตให้สร้าง PDF จากเว็บไซต์อื่น" },
        { status: 403 }
      );
    }

    const serverCacheKey = createHash("sha256")
      .update(filename)
      .update("\u0000")
      .update(html)
      .digest("hex");

    if (
      latestPdfCache?.key === serverCacheKey &&
      Date.now() - latestPdfCache.createdAt <
        PDF_CACHE_TTL_MS &&
      latestPdfCache.buffer?.length > 0
    ) {
      return createPdfResponse(
        latestPdfCache.buffer,
        filename
      );
    }

    const browser =
      await getSharedBrowser(requestOrigin);

    browserContext =
      await browser.createBrowserContext();

    const page = await browserContext.newPage();

    page.setDefaultNavigationTimeout(30_000);
    page.setDefaultTimeout(30_000);

    await page.setCacheEnabled(true);
    await page.setRequestInterception(true);

    page.on("request", (resourceRequest) => {
      const resourceUrl = resourceRequest.url();

      if (
        resourceUrl.startsWith("data:") ||
        resourceUrl.startsWith("about:")
      ) {
        resourceRequest.continue().catch(() => {});
        return;
      }

      try {
        const parsedUrl = new URL(resourceUrl);

        const allowed =
          parsedUrl.origin === documentOrigin ||
          parsedUrl.hostname === "fonts.googleapis.com" ||
          parsedUrl.hostname === "fonts.gstatic.com";

        if (allowed) {
          resourceRequest.continue().catch(() => {});
        } else {
          resourceRequest.abort().catch(() => {});
        }
      } catch {
        resourceRequest.abort().catch(() => {});
      }
    });

    await page.emulateMediaType("screen");

    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30_000,
    });

    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const pendingImages = Array.from(
        document.querySelectorAll("img")
      ).filter((image) => !image.complete);

      await Promise.allSettled(
        pendingImages.map(
          (image) =>
            new Promise((resolve) => {
              const timer = window.setTimeout(
                resolve,
                2500
              );

              const finish = () => {
                window.clearTimeout(timer);
                resolve();
              };

              image.addEventListener(
                "load",
                finish,
                { once: true }
              );

              image.addEventListener(
                "error",
                finish,
                { once: true }
              );
            })
        )
      );

      await new Promise((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(resolve)
        )
      );
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
      timeout: 45_000,
    });

    const pdfBuffer = Buffer.from(pdf);

    latestPdfCache = {
      key: serverCacheKey,
      buffer: pdfBuffer,
      createdAt: Date.now(),
    };

    return createPdfResponse(
      pdfBuffer,
      filename
    );
  } catch (error) {
    const message =
      error?.message ||
      "ไม่สามารถสร้าง PDF แบบคมชัดได้";

    if (
      /browser.*disconnect|browser.*closed|target closed|session closed|protocol error/i.test(
        message
      )
    ) {
      sharedBrowserPromise = null;
    }

    console.error(
      "Vector PDF generation error:",
      error
    );

    return Response.json(
      { error: message },
      { status: 500 }
    );
  } finally {
    if (browserContext) {
      await browserContext.close().catch(() => {});
    }
  }
}
