import { readFile } from "node:fs/promises";

import { expect, type Download, type Locator, type Page } from "@playwright/test";

import { getToolcraftFieldByLabel } from "./performance-helpers";

export async function openMuralApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.locator("[data-toolcraft-product-output]")).toBeVisible();
}

export function makeArtworkSvg({
  height = 600,
  variant = "split",
  width = 800,
}: {
  height?: number;
  variant?: "colorful" | "rings" | "split";
  width?: number;
} = {}): string {
  if (variant === "rings") {
    // Concentric rings are not scale-invariant, so Size/Padding changes
    // always alter the sampled cells (unlike centered quadrants).
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) / 2;
    const colors = ["#ff2200", "#ffee00", "#00cc44", "#2244ff", "#ffffff"];
    const circles = colors
      .map(
        (color, index) =>
          `<circle cx="${cx}" cy="${cy}" r="${(maxRadius * (colors.length - index)) / colors.length}" fill="${color}"/>`,
      )
      .join("");

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      `<rect width="${width}" height="${height}" fill="#000000"/>`,
      circles,
      `</svg>`,
    ].join("");
  }

  if (variant === "colorful") {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      `<rect width="${width / 2}" height="${height / 2}" fill="#ff2200"/>`,
      `<rect x="${width / 2}" width="${width / 2}" height="${height / 2}" fill="#00cc44"/>`,
      `<rect y="${height / 2}" width="${width / 2}" height="${height / 2}" fill="#2244ff"/>`,
      `<rect x="${width / 2}" y="${height / 2}" width="${width / 2}" height="${height / 2}" fill="#ffee00"/>`,
      `</svg>`,
    ].join("");
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<rect width="${width / 2}" height="${height}" fill="#000000"/>`,
    `<rect x="${width / 2}" width="${width / 2}" height="${height}" fill="#ffffff"/>`,
    `</svg>`,
  ].join("");
}

export async function uploadArtwork(
  page: Page,
  svg: string,
  fileName = "artwork.svg",
): Promise<void> {
  const input = page.locator('input[type="file"]').first();

  await input.setInputFiles({
    buffer: Buffer.from(svg, "utf8"),
    mimeType: "image/svg+xml",
    name: fileName,
  });
}

export async function selectToolcraftOption(
  page: Page,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  // Filter to fields that actually contain a select trigger so label
  // prefixes shared with non-select fields (e.g. runtime "Resolution scale")
  // cannot collide with a select label such as "Resolution".
  const field = page
    .locator('[data-slot="field"]')
    .filter({ hasText: new RegExp(`^${fieldLabel}`) })
    .filter({ has: page.locator('[role="combobox"], [data-slot="select-trigger"]') })
    .first();

  await expect(field, `Select field "${fieldLabel}" should be visible`).toBeVisible();

  await field.getByRole("combobox").first().click();

  // The select popup portal sits inside an aria-hidden container, so the
  // items are not reachable through the accessibility tree; target the
  // Toolcraft select-item slot instead.
  const option = page
    .locator('[data-slot="select-item"]')
    .filter({ hasText: new RegExp(`^${optionLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();

  await expect(option, `Select option "${optionLabel}" should appear`).toBeVisible();
  await option.click();
  await expect(option, `Select popup should close after choosing "${optionLabel}"`).toBeHidden();
}

export async function clickSegment(
  page: Page,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, fieldLabel);
  const segment = field.getByRole("button", { exact: true, name: optionLabel }).first();

  await expect(segment, `Segment "${optionLabel}" should be visible`).toBeVisible();
  await segment.click();
}

export async function setSettingTextField(
  page: Page,
  fieldLabel: string,
  value: string,
): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, fieldLabel);
  const input = field.locator("input").first();

  await input.fill(value);
  await input.press("Enter");
}

export async function setColorFieldHex(
  page: Page,
  colorName: string,
  hex: string,
): Promise<void> {
  const input = page.locator(`input[aria-label="${colorName} hex"]`).first();

  await expect(input, `Color input "${colorName} hex" should be visible`).toBeVisible();
  await input.fill(hex.replace(/^#/, ""));
  await input.press("Enter");
}

/**
 * Raw mouse drags do not auto-scroll like locator clicks, so fields deep in
 * the controls panel must be scrolled into the viewport first.
 */
export async function scrollFieldIntoView(page: Page, fieldLabel: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, fieldLabel);

  await field.scrollIntoViewIfNeeded();
}

export async function toggleSwitch(page: Page, switchLabel: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, switchLabel);
  const toggle = field.locator('[role="switch"], [data-slot="switch"]').first();

  await expect(toggle, `Switch "${switchLabel}" should be visible`).toBeVisible();

  const before = (await toggle.getAttribute("aria-checked")) ?? "";

  await toggle.click();
  await expect(
    toggle,
    `Switch "${switchLabel}" should flip after clicking`,
  ).not.toHaveAttribute("aria-checked", before);
}

export async function clickFooterAction(page: Page, actionLabel: string): Promise<Download> {
  const downloadPromise = page.waitForEvent("download");

  await page.getByRole("button", { name: actionLabel }).click();

  return downloadPromise;
}

export async function readDownloadBuffer(download: Download): Promise<Buffer> {
  const filePath = await download.path();

  if (!filePath) {
    throw new Error("Download did not produce a file path.");
  }

  return readFile(filePath);
}

export function parsePngDimensions(buffer: Buffer): { height: number; width: number } {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    throw new Error("Not a PNG file.");
  }

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

export function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

export type DecodedImageProbe = {
  cornerAlpha: number;
  height: number;
  width: number;
};

/** Decodes exported image bytes inside the page and reads the top-left pixel alpha. */
export async function probeExportedImage(
  page: Page,
  buffer: Buffer,
  mimeType: string,
): Promise<DecodedImageProbe> {
  const base64 = buffer.toString("base64");

  return page.evaluate(
    async ({ base64: data, mimeType: type }) => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to decode exported image."));
      });

      image.src = `data:${type};base64,${data}`;
      await loaded;

      const canvas = document.createElement("canvas");

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("No 2d context for export probe.");
      }

      context.drawImage(image, 0, 0);

      const pixel = context.getImageData(2, 2, 1, 1).data;

      return {
        cornerAlpha: pixel[3] ?? 0,
        height: image.naturalHeight,
        width: image.naturalWidth,
      };
    },
    { base64, mimeType },
  );
}

export function findMuralField(page: Page, label: string): Promise<Locator> {
  return getToolcraftFieldByLabel(page, label);
}
