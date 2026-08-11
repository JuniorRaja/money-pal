import { useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { archiveAccount } from "@/data/mutations";
import type { Account } from "@/data/schema";

export function DeleteAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  if (!account) return null;

  const confirm = async () => {
    setDeleting(true);
    try {
      const success = await archiveAccount(account.id);
      if (success) {
        toast.success(`"${account.name}" has been archived`);
        onOpenChange(false);
        router.invalidate();
      } else {
        toast.error("Failed to archive account");
      }
    } catch (err) {
      toast.error("Something went wrong");
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Archive Account
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to archive <strong>{account.name}</strong>? The account
            and its slices will be hidden from view. This can be undone later.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="pt-4">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={confirm}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {deleting ? "Archiving…" : "Archive"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
