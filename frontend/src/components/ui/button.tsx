// AI-assisted: Used Claude to adapt the shadcn/ui button to Enigma's palette.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/btn inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* The one thing to do on a screen */
        primary:
          "bg-melon text-night hover:bg-melon-lit",
        ink: "bg-ink text-sheet hover:bg-night-3",
        outline: "border-[1.5px] border-ink text-ink hover:bg-ink hover:text-sheet",
        "outline-frost": "border-[1.5px] border-frost/35 text-frost hover:border-frost hover:bg-frost/8",
        ghost: "text-current hover:bg-current/8",
      },
      size: {
        default: "h-10 px-4 text-[15px]",
        sm: "h-8 px-3 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
