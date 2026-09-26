import { cn } from "@/lib/format";

/**
 * The APTECH Computer Education logo.
 *
 * It is a dark slanted banner, so it sits on a white plate — invisible on a white
 * header, and on a dark one it reads as a proper mark rather than a black smudge.
 */
export default function AptechMark({ className, height = "h-7" }: { className?: string; height?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md bg-white px-1.5 py-1", className)}>
      <img src="/aptech-logo.webp" alt="APTECH Computer Education" className={cn(height, "w-auto")} />
    </span>
  );
}
