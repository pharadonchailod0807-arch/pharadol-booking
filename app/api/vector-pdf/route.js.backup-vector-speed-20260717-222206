import { existsSync } from "node:fs";
import puppeteerCore from "puppeteer-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cachedChromiumPath = "";
let chromiumDownloadPromise = null;

const sanitizeFilename = (value) => {
  const cleaned = String(value || "booking.pdf")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : `${cleaned || "booking"}.pdf`;
};

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

export async function POST(request) {
  let browser;

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

    browser = await launchBrowser(requestOrigin);

    const page = await browser.newPage();

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
      waitUntil: [
        "domcontentloaded",
        "networkidle0",
      ],
      timeout: 45_000,
    });

    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const images = Array.from(
        document.querySelectorAll("img")
      );

      await Promise.allSettled(
        images.map(
          (image) =>
            new Promise((resolve) => {
              if (image.complete) {
                resolve();
                return;
              }

              const timer = window.setTimeout(
                resolve,
                6000
              );

              image.addEventListener(
                "load",
                () => {
                  window.clearTimeout(timer);
                  resolve();
                },
                { once: true }
              );

              image.addEventListener(
                "error",
                () => {
                  window.clearTimeout(timer);
                  resolve();
                },
                { once: true }
              );
            })
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

    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Vector PDF generation error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "ไม่สามารถสร้าง PDF แบบคมชัดได้",
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
