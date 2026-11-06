import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { useAuth } from "../lib/auth";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Enter your email")
    .email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setApiError(null);
    try {
      await login(data.email, data.password);
      window.location.assign("/");
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 429) {
          setApiError("Too many attempts. Try again in a minute.");
        } else if (err.response?.status === 401) {
          setApiError("Invalid email or password");
        } else {
          setApiError("Backend unreachable. Is the API running?");
        }
      } else {
        setApiError("Unexpected error");
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-md">
        <h1 className="text-lg font-bold text-brand">GSPC Pipavav Power Corporation Ltd.</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to the reporting system</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
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
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
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

          {apiError && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-brand py-2 font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          <Link to="/login" aria-disabled className="pointer-events-none underline">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}
