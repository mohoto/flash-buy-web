"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-transparent font-medium outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [button&,a&]:cursor-pointer [button&,a&]:pointer-coarse:after:absolute [button&,a&]:pointer-coarse:after:size-full [button&,a&]:pointer-coarse:after:min-h-11 [button&,a&]:pointer-coarse:after:min-w-11",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default:
          "min-h-5.5 min-w-5.5 px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1)-1px)] text-sm sm:min-h-4.5 sm:min-w-4.5 sm:text-xs",
        lg: "min-h-6.5 min-w-6.5 px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1.5)-1px)] text-base sm:min-h-5.5 sm:min-w-5.5 sm:text-sm",
        sm: "min-h-5 min-w-5 px-[calc(--spacing(1.5)-1px)] py-[calc(--spacing(0.5)-1px)] text-xs sm:min-h-4 sm:min-w-4 sm:text-[.625rem]",
      },
      variant: {
        ai: "bg-violet-500 text-white",
        default:
          "bg-primary text-primary-foreground [button&,a&]:hover:bg-primary/90",
        destructive:
          "bg-destructive text-white [button&,a&]:hover:bg-destructive/90",
        error: "bg-destructive text-white",
        info: "bg-info/8 text-info-foreground dark:bg-info/16",
        outline:
          "border-input bg-background text-foreground dark:bg-input/32 [button&,a&]:hover:bg-accent/50 dark:[button&,a&]:hover:bg-input/48",
        secondary:
          "bg-secondary text-secondary-foreground [button&,a&]:hover:bg-secondary/90",
        success: "bg-success text-white",
        warning: "bg-warning text-white",
      },
    },
  },
);

export interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
  size?: VariantProps<typeof badgeVariants>["size"];
}

export function Badge({
  className,
  variant,
  size,
  render,
  ...props
}: BadgeProps): React.ReactElement {
  const defaultProps = {
    className: cn(badgeVariants({ className, size, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}
