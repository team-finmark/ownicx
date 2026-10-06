"use client";

/** Prints the page; the print stylesheet hides the dashboard chrome, leaving an A4 bill (or "Save as PDF"). */
export function PrintButton({ label = "Print / Save PDF", className = "btn" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
