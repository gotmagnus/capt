"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/page";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

type ServerAction<T> = (prev: ActionResult<T> | undefined, formData: FormData) => Promise<ActionResult<T>>;

/**
 * Form wired to a server action returning ActionResult. Shows errors inline, toasts
 * success, and optionally redirects or closes a dialog. Use `hidden` for fixed fields.
 */
export function ActionForm<T = undefined>({
  action,
  children,
  className,
  onSuccess,
  successMessage,
  redirectTo,
  hidden,
  resetOnSuccess,
}: {
  action: ServerAction<T>;
  children: React.ReactNode | ((state: { pending: boolean; fieldErrors: Record<string, string> }) => React.ReactNode);
  className?: string;
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void;
  successMessage?: string;
  redirectTo?: string | ((result: Extract<ActionResult<T>, { ok: true }>) => string);
  hidden?: Record<string, string | number | undefined | null>;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult<T> | undefined, FormData>(action, undefined);
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const handled = React.useRef<ActionResult<T> | undefined>(undefined);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (successMessage || state.message) toast.success(state.message ?? successMessage);
      onSuccess?.(state);
      if (resetOnSuccess) formRef.current?.reset();
      if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(state) : redirectTo);
    } else {
      toast.error(state.error);
    }
  }, [state, onSuccess, successMessage, redirectTo, router, resetOnSuccess]);

  const fieldErrors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form ref={formRef} action={formAction} className={className}>
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (v === undefined || v === null ? null : <input key={k} type="hidden" name={k} value={String(v)} />))
        : null}
      {typeof children === "function" ? children({ pending, fieldErrors }) : children}
      {state && !state.ok && !Object.keys(fieldErrors).length ? <Alert tone="danger" className="mt-3">{state.error}</Alert> : null}
    </form>
  );
}

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatusSafe();
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

import { useFormStatus } from "react-dom";
function useFormStatusSafe() {
  try {
    return useFormStatus();
  } catch {
    return { pending: false };
  }
}

/** Dialog containing an ActionForm; closes itself on success. */
export function FormDialog<T = undefined>({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Save",
  size = "md",
  hidden,
  successMessage,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
  redirectTo,
  destructive,
}: {
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action: ServerAction<T>;
  children: React.ReactNode | ((state: { pending: boolean; fieldErrors: Record<string, string> }) => React.ReactNode);
  submitLabel?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  hidden?: Record<string, string | number | undefined | null>;
  successMessage?: string;
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  redirectTo?: string | ((result: Extract<ActionResult<T>, { ok: true }>) => string);
  destructive?: boolean;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent size={size}>
        <ActionForm
          action={action}
          hidden={hidden}
          successMessage={successMessage}
          redirectTo={redirectTo}
          onSuccess={(r) => {
            setOpen(false);
            onSuccess?.(r);
          }}
          className="flex max-h-[90dvh] min-h-0 flex-col"
        >
          {(s) => (
            <>
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                {description ? <DialogDescription>{description}</DialogDescription> : null}
              </DialogHeader>
              <DialogBody className="space-y-4">{typeof children === "function" ? children(s) : children}</DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton variant={destructive ? "destructive" : "default"}>{submitLabel}</SubmitButton>
              </DialogFooter>
            </>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Button that runs a server action with a confirm step. */
export function ConfirmButton({
  action,
  title,
  description,
  confirmLabel = "Confirm",
  children,
  variant = "secondary",
  size,
  hidden,
  successMessage,
  redirectTo,
  className,
}: {
  action: ServerAction<undefined>;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  hidden?: Record<string, string | number | undefined | null>;
  successMessage?: string;
  redirectTo?: string;
  className?: string;
}) {
  return (
    <FormDialog
      trigger={
        <Button variant={variant} size={size} className={className}>
          {children}
        </Button>
      }
      title={title}
      description={description}
      action={action}
      hidden={hidden}
      submitLabel={confirmLabel}
      successMessage={successMessage}
      redirectTo={redirectTo}
      size="sm"
      destructive={variant === "destructive"}
    >
      <p className="text-[13px] text-muted-foreground">This action is recorded in the audit log.</p>
    </FormDialog>
  );
}
