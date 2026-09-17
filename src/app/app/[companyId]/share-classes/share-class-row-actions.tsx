"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/forms";
import { ShareClassFormDialog, type ShareClassFormValues } from "./share-class-form";
import { deleteShareClass } from "./actions";

export function ShareClassRowActions({ companyId, shareClass, inUse }: { companyId: string; shareClass: ShareClassFormValues & { id: string; name: string }; inUse: boolean }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Actions" data-no-row>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil /> Edit terms
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive disabled={inUse} onSelect={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareClassFormDialog companyId={companyId} initial={shareClass} open={editOpen} onOpenChange={setEditOpen} />
      <FormDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${shareClass.name}`} description="Only classes with no securities, plans or rounds can be deleted." action={deleteShareClass} hidden={{ companyId, id: shareClass.id }} submitLabel="Delete" destructive size="sm">
        <p className="text-[13px] text-muted-foreground">This is recorded in the audit log.</p>
      </FormDialog>
    </>
  );
}
