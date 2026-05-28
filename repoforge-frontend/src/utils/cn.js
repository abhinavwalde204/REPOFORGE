/**
 * Simple utility to combine and filter class names dynamically.
 */
export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}
