import type { Settings } from "./model.js";

export function colorInk(hex: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#111111" : "#ffffff";
}

export function themeVariables(settings: Settings) {
  return {
    "--accent": settings.accent,
    "--primary": settings.primaryColor,
    "--primary-ink": colorInk(settings.primaryColor),
    "--accent-ink": colorInk(settings.accent),
    "--sage": settings.primaryColor,
  };
}
