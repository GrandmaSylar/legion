"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";

import { cn } from "./utils";

/** The look (tile, drawn tick, glow, larger touch area) lives in src/styles/surfaces.css so native and Radix boxes match. */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root data-slot="checkbox" className={cn(className)} {...props} />;
}

export { Checkbox };
