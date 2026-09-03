import { useState, type ReactNode } from 'react';

import {
  Dialog as UIDialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet as UISheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * Thin wrappers that keep the old imperative `onClose` API while rendering on
 * the shadcn/Radix primitives. Callers mount them conditionally, so they open
 * on mount and call `onClose` on any dismissal.
 */

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the × so a destructive confirm has to be answered by its buttons. */
  hideClose?: boolean;
}

export function Dialog({ title, onClose, children, footer, hideClose }: DialogProps) {
  const [open, setOpen] = useState(true);

  function change(next: boolean) {
    if (next) return;
    setOpen(false);
    onClose();
  }

  return (
    <UIDialog open={open} onOpenChange={change}>
      <DialogContent
        showCloseButton={!hideClose}
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (hideClose) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (hideClose) event.preventDefault();
        }}
        className="max-h-[90dvh] gap-0 overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </UIDialog>
  );
}

interface SheetProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ title, onClose, children }: SheetProps) {
  const [open, setOpen] = useState(true);

  function change(next: boolean) {
    if (next) return;
    setOpen(false);
    onClose();
  }

  return (
    <UISheet open={open} onOpenChange={change}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{title ?? ''}</SheetTitle>
        </SheetHeader>
        <div className="pb-2">{children}</div>
      </SheetContent>
    </UISheet>
  );
}
