"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { ROLES, ROLE_LABELS } from "@/lib/types";
import { changeRole } from "@/app/app/[companyId]/settings/actions";

export function RoleSelect({ companyId, userId, role, disabled }: { companyId: string; userId: string; role: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    // Shared Select primitive (custom chevron) instead of a bare native control; the wrapper sets the width.
    <div className="w-36">
      <Select
        value={role}
        disabled={disabled || pending}
        data-no-row
        onChange={(e) => {
          const fd = new FormData();
          fd.set("companyId", companyId);
          fd.set("userId", userId);
          fd.set("role", e.target.value);
          start(async () => {
            const res = await changeRole(undefined, fd);
            if (res.ok) toast.success(res.message ?? "Role updated");
            else toast.error(res.error);
          });
        }}
        aria-label="Role"
        className="h-8 text-xs"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
    </div>
  );
}
