/* Admin: user list + create/edit modal + unit assignment. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAxiosError } from "axios";
import { AppShell } from "../../components/AppShell";
import { Badge, EmptyState, Field, Modal, PrimaryButton, SecondaryButton } from "../../components/ui";
import { api } from "../../lib/api";
import type { Role, Unit, UserCreatePayload, UserListEntry, UserUpdatePayload } from "../../types/api";

const ALL_ROLES: Role[] = ["ADMIN", "PLANT_USER", "VIEWER"];

function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg ?? "").join("; ");
  }
  return fallback;
}

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").optional().or(z.literal("")),
  role: z.enum(["ADMIN", "PLANT_USER", "VIEWER"]),
});
type UserForm = z.infer<typeof userSchema>;

export function AdminUsersPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: "create" } | { mode: "edit"; user: UserListEntry } | { mode: "units"; user: UserListEntry } | null
  >(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserListEntry[]>("/users").then((r) => r.data) });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["users"] });

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (isAxiosError(err)) {
      const detail = err.response?.data?.detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) return detail.map((d) => d.msg ?? "").join("; ");
    }
    return fallback;
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        <PrimaryButton onClick={() => setModalState({ mode: "create" })}>+ New user</PrimaryButton>
      </div>
      {pageError && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-danger">{pageError}</p>}

      <div className="mt-4 overflow-x-auto rounded-lg bg-white shadow-sm">
        {usersQuery.isLoading ? (
          <EmptyState message="Loading users…" />
        ) : usersQuery.isError ? (
          <EmptyState message="Could not load users (are you ADMIN?)" />
        ) : (usersQuery.data ?? []).length === 0 ? (
          <EmptyState message="No users yet" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Units</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">
                    {u.role === "ADMIN" && <Badge tone="brand">ADMIN</Badge>}
                    {u.role === "PLANT_USER" && <Badge tone="ok">PLANT_USER</Badge>}
                    {u.role === "VIEWER" && <Badge tone="warn">VIEWER</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    {u.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-2">{u.unit_ids.length}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <SecondaryButton onClick={() => setModalState({ mode: "edit", user: u })}>Edit</SecondaryButton>
                      <SecondaryButton onClick={() => setModalState({ mode: "units", user: u })}>Units</SecondaryButton>
                      {u.is_active && (
                        <SecondaryButton danger onClick={() => void deactivate(u)}>
                          Deactivate
                        </SecondaryButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalState?.mode === "create" && (
        <UserModal onClose={() => setModalState(null)} onSaved={invalidate} onError={setPageError} />
      )}
      {modalState?.mode === "edit" && (
        <UserModal user={modalState.user} onClose={() => setModalState(null)} onSaved={invalidate} onError={setPageError} />
      )}
      {modalState?.mode === "units" && (
        <UnitsModal
          user={modalState.user}
          onClose={() => setModalState(null)}
          onSaved={invalidate}
          onError={setPageError}
        />
      )}
    </AppShell>
  );

  async function deactivate(user: UserListEntry) {
    if (!window.confirm(`Deactivate ${user.name}?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      invalidate();
    } catch (err) {
      setPageError(apiErrorMessage(err, "Could not deactivate user"));
    }
  }
}

function UserModal({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user?: UserListEntry;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: user
      ? { name: user.name, email: user.email, role: user.role, password: "" }
      : { role: "VIEWER" },
  });

  async function onSubmit(data: UserForm) {
    onError("");
    try {
      if (user) {
        const payload: UserUpdatePayload = { name: data.name, role: data.role };
        await api.patch(`/users/${user.id}`, payload);
      } else {
        const payload: UserCreatePayload = {
          name: data.name,
          email: data.email,
          password: data.password ?? "",
          role: data.role,
          unit_ids: [],
        };
        await api.post("/users", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const detail =
        isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : user
            ? "Could not save changes"
            : "Could not create user";
      onError(detail);
      onClose();
    }
  }

  return (
    <Modal title={user ? `Edit ${user.name}` : "Create user"} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Name" error={errors.name?.message}>
          <input className="w-full rounded border border-slate-300 px-3 py-2" {...register("name")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            className="w-full rounded border border-slate-300 px-3 py-2"
            disabled={!!user}
            {...register("email")}
          />
        </Field>
        {!user && (
          <Field label="Password" error={errors.password?.message}>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded border border-slate-300 px-3 py-2"
              {...register("password")}
            />
          </Field>
        )}
        <Field label="Role" error={errors.role?.message}>
          <select className="w-full rounded border border-slate-300 px-3 py-2" {...register("role")}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {user ? "Save changes" : "Create user"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function UnitsModal({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: UserListEntry;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const unitsQuery = useQuery({
    queryKey: ["units", "all"],
    queryFn: () => api.get<Unit[]>("/units").then((r) => r.data),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set(user.unit_ids));

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      await api.post(`/users/${user.id}/units`, { unit_ids: [...selected] });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => {
      onError(apiErrorMessage(err, "Could not save unit assignment"));
      onClose();
    },
  });

  const units = unitsQuery.data ?? [];

  return (
    <Modal title={`Unit access — ${user.name}`} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        Saving <strong>replaces</strong> all assignments for this user.
      </p>
      {unitsQuery.isLoading ? (
        <EmptyState message="Loading units…" />
      ) : units.length === 0 ? (
        <EmptyState message="No units exist yet" />
      ) : (
        <div className="space-y-2">
          {units.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="h-4 w-4 accent-[#0f4c81]"
              />
              <span>{u.unit_number}</span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending || unitsQuery.isLoading}>
          Save unit access
        </PrimaryButton>
      </div>
    </Modal>
  );
}
