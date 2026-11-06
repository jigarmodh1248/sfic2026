/* Separate administrator sign-in (same credentials, dedicated screen + role gate). */

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";

const schema = z.object({
  email: z.string().trim().min(3, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type FormData = z.infer<typeof schema>;

export function AdminLoginPage() {
  const { login, logout } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      const user = await login(data.email, data.password);
      // hard role gate: this screen never accepts plant/viewer accounts
      if (user.role !== "ADMIN") {
        await logout();
        toast.error("This account is not an administrator. Use the plant user sign in.");
        window.location.assign("/login");
        return;
      }
      window.location.assign("/dashboard");
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 429) {
          toast.error("Too many attempts. Try again in a minute.");
        } else if (err.response?.status === 401) {
          toast.error("Invalid administrator email or password");
        } else {
          toast.error("Backend unreachable. Is the API running?");
        }
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
            <h1 className="text-lg font-bold text-brand">Administrator access</h1>
            <p className="text-xs text-slate-500">GSPC Pipavav Power Corporation Ltd.</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          This page is for administrators only. Plant users sign in from the main portal.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium">
              Administrator email
            </label>
            <input
              id="admin-email"
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
            <label htmlFor="admin-password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-brand py-2 font-semibold text-white shadow-sm hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
          >
            <ShieldCheck size={16} aria-hidden />
            {isSubmitting ? "Verifying…" : "Sign in as administrator"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          New administrator?{" "}
          <Link to="/admin/register" className="font-medium text-brand underline">
            Register
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
