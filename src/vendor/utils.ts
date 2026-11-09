// Vendored from vercel-labs/json-render examples/chat @ 18194121c8 (Apache-2.0, see src/vendor/LICENSE).
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
