import { Loader2 } from "lucide-react";
import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ButtonLoaderProps extends ButtonProps {
  /** Whether the button is in a loading/pending state. */
  loading?: boolean;
  /** Text to display while loading. Falls back to children if not provided. */
  loadingText?: string;
}

/**
 * Button with built-in loading state. Disables interactions and shows a
 * spinner when `loading` is true. Keeps width stable by preserving the
 * original content dimensions.
 */
const ButtonLoader = React.forwardRef<HTMLButtonElement, ButtonLoaderProps>(
  ({ loading = false, loadingText, children, className, disabled, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn("relative", className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading && loadingText ? loadingText : children}
      </Button>
    );
  },
);
ButtonLoader.displayName = "ButtonLoader";

export { ButtonLoader };
