import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(
  fileURLToPath(import.meta.url)
);
const projectRoot = dirname(currentDirectory);

try {
  const chromiumResolvedPath = import.meta.resolve(
    "@sparticuz/chromium"
  );

  const chromiumPath = fileURLToPath(
    chromiumResolvedPath
  );

  const chromiumDirectory = dirname(
    dirname(dirname(chromiumPath))
  );

  const binaryDirectory = join(
    chromiumDirectory,
    "bin"
  );

  if (!existsSync(binaryDirectory)) {
    console.log(
      "Chromium bin directory not found; skipping pack creation."
    );
    process.exit(0);
  }

  const publicDirectory = join(
    projectRoot,
    "public"
  );

  const outputPath = join(
    publicDirectory,
    "chromium-pack.tar"
  );

  mkdirSync(publicDirectory, {
    recursive: true,
  });

  execFileSync(
    "tar",
    [
      "-cf",
      outputPath,
      "-C",
      binaryDirectory,
      ".",
    ],
    {
      stdio: "inherit",
      cwd: projectRoot,
    }
  );

  console.log(
    "Chromium pack created:",
    outputPath
  );
} catch (error) {
  console.error(
    "Chromium pack creation skipped:",
    error?.message || error
  );

  process.exit(0);
}
