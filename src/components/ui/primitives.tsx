import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "default" | "sm" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={`ui-button ${className}`.trim()}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div ref={ref} data-slot="card" className={`ui-card ${className}`.trim()} {...props} />
  ),
);
Card.displayName = "Card";

export function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <span data-slot="badge" className={`ui-badge ${className}`.trim()}>{children}</span>;
}

export function Avatar({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <span data-slot="avatar" className={`ui-avatar ${className}`.trim()}>{children}</span>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} data-slot="input" className={`ui-input ${className}`.trim()} {...props} />
  ),
);
Input.displayName = "Input";

export function Progress({
  value,
  label,
  className = "",
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`ui-progress ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
    >
      <span style={{ width: `${clampedValue}%` }} />
    </div>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className="ui-checkbox"
    >
      <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
        <Check size={12} strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  children,
  className = "",
  overlayClassName = "",
}: {
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={`ui-dialog-overlay ${overlayClassName}`.trim()} />
      <DialogPrimitive.Content className={`ui-dialog-content ${className}`.trim()}>
        {children}
        <DialogPrimitive.Close className="ui-dialog-close" aria-label="Close dialog">
          <X size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
