import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names safely — later classes win for the same property.
 *   cn("p-2", "p-4")            → "p-4"
 *   cn("text-txt", isActive && "text-cyan")
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}