// AI-assisted: Used Claude to write this file.
import { cn } from "@/lib/utils";

/**
 * The seam between two sections: a short fuse with a spark running down it, so the page
 * reads as one path a document takes, from the hero to the receipt.
 */
export function Seam({ className, tone = "volt" }: { className?: string; tone?: "volt" | "melon" }) {
  return (
    <div className={cn("relative flex h-28 justify-center md:h-36", className)} aria-hidden="true">
      <div
        className={cn(
          "relative h-full w-px overflow-hidden",
          tone === "volt"
            ? "bg-[linear-gradient(180deg,rgb(92_196_255/0),rgb(92_196_255/0.55)_50%,rgb(92_196_255/0))]"
            : "bg-[linear-gradient(180deg,rgb(92_196_255/0),rgb(252_115_77/0.6)_50%,rgb(252_115_77/0))]",
        )}
      >
        <span
          className={cn(
            "seam-spark absolute left-1/2 h-10 w-[3px] -translate-x-1/2 rounded-full",
            tone === "volt" ? "bg-[linear-gradient(180deg,transparent,#5cc4ff,#fff)]" : "bg-[linear-gradient(180deg,transparent,#fc734d,#fff)]",
          )}
        />
      </div>
      <span
        className={cn(
          "absolute bottom-0 size-2 translate-y-1/2 rounded-full",
          tone === "volt" ? "bg-volt-lit shadow-[0_0_0_4px_rgb(2_151_222/0.2),0_0_18px_rgb(92_196_255/0.9)]" : "bg-melon shadow-[0_0_0_4px_rgb(252_115_77/0.2),0_0_18px_rgb(252_115_77/0.9)]",
        )}
      />
    </div>
  );
}
