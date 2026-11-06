/* Separate administrator self-registration (mail + password → ADMIN account). */

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().min(3, "Enter your email").email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.confirm === d.password, {
    path: ["confirm"],
    message: "Passwords do not match",
  });
type FormData = z.infer<typeof schema>;

export function AdminRegisterPage() {
  const { registerAdmin } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      await registerAdmin(data.name, data.email, data.password);
      toast.success(`Administrator ${data.name} registered`);
      window.location.assign("/dashboard");
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        toast.error(
          typeof detail === "string"
            ? detail
            : err.response?.status === 429
              ? "Too many attempts. Try again in a minute."
              : `Registration failed (${err.response?.status ?? "network"})`,
        );
      } else {
        toast.error("Unexpected error");
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand-light p-2 text-brand">
            <ShieldCheck size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold text-brand">Register administrator</h1>
            <p className="text-xs text-slate-500">Creates a new ADMIN account</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Registered administrators sign in through the administrator page with this email and
          password.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium">
              Full name
            </label>
            <input
              id="reg-name"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              {...register("name")}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium">
              Mail ID
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reg-confirm" className="block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="reg-confirm"
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              {...register("confirm")}
            />
            {errors.confirm && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {errors.confirm.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-brand py-2 font-semibold text-white shadow-sm hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
          >
            <UserPlus size={16} aria-hidden />
            {isSubmitting ? "Creating account…" : "Register as administrator"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Already registered?{" "}
          <Link to="/admin/login" className="font-medium text-brand underline">
            Administrator sign in
          </Link>
        </p>
        <p className="mt-1 text-center text-xs text-slate-500">
          <Link to="/login" className="underline">
            ← Plant user sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
