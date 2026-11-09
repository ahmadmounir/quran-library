import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class names joined, the later one winning on a conflict */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
