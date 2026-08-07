import { useState, type FormEvent } from "react";
import { apiFetch, clearCsrfToken } from "../../lib/apiClient";
import RolevyaLogo from "../branding/RolevyaLogo";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthPageProps {
  apiBaseUrl: string;
  legacyUserId: string;
  onAuthenticated: (user: AuthUser, isNewAccount: boolean) => void;
}

interface ProblemDetails {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

async function readError(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as ProblemDetails;
    const validationErrors = Object.values(problem.errors ?? {}).flat();
    return validationErrors.join(" ") || problem.detail || problem.title || "The request failed.";
  } catch {
    return `The request failed (${response.status}).`;
  }
}

export default function AuthPage({
  apiBaseUrl,
  legacyUserId,
  onAuthenticated,
}: AuthPageProps): JSX.Element {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function changeMode(nextMode: "login" | "register"): void {
    setMode(nextMode);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      clearCsrfToken(apiBaseUrl);
      const response = await apiFetch(apiBaseUrl, `/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email: email.trim(), password, rememberMe }
            : {
                email: email.trim(),
                password,
                confirmPassword,
                legacyUserId,
              },
        ),
      });
      if (!response.ok) throw new Error(await readError(response));

      const authenticatedUser = (await response.json()) as AuthUser;
      clearCsrfToken(apiBaseUrl);
      onAuthenticated(authenticatedUser, mode === "register");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f3f0e8] text-[#172033] lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
      <section className="relative hidden overflow-hidden border-r-2 border-[#172033] bg-[#3157d5] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-[#ffcc4d] opacity-95" />
        <div className="relative">
          <RolevyaLogo inverse showDescriptor />
        </div>
        <div className="relative max-w-2xl pb-12">
          <p className="mb-5 text-xs font-black uppercase tracking-[0.2em] text-[#ffdc78]">Your application workspace</p>
          <h1 className="text-5xl font-black leading-[1.04] tracking-[-0.045em] xl:text-6xl">
            Prepare with purpose. Keep every opportunity moving.
          </h1>
          <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-blue-100">
            Review your CV, tailor it truthfully, prepare for the first interview, and track the whole journey in one place.
          </p>
        </div>
        <p className="relative text-xs font-bold text-blue-100">Your CV and applications remain connected to your account.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <RolevyaLogo showDescriptor />
          </div>

          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c84736]">
            {mode === "login" ? "Welcome back" : "Create your workspace"}
          </p>
          <h2 className="mt-2 text-4xl font-black tracking-[-0.04em]">
            {mode === "login" ? "Sign in to continue." : "Start your job search."}
          </h2>
          <p className="mt-3 text-sm font-medium leading-6 text-[#626979]">
            {mode === "login"
              ? "Use the email address connected to your account."
              : "Your existing local CVs and applications will move into your new account."}
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-xl border border-[#c8c5bd] bg-[#e6e2d8] p-1">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeMode(item)}
                className={`rounded-lg px-3 py-2.5 text-sm font-black transition ${mode === item ? "bg-white text-[#172033] shadow-sm" : "text-[#697080] hover:text-[#172033]"}`}
              >
                {item === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
            <label className="block text-sm font-black">
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={256}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-lg border-2 border-[#a9abb2] bg-white px-4 py-3 font-medium outline-none transition placeholder:text-[#9a9eaa] focus:border-[#3157d5] focus:ring-4 focus:ring-[#3157d5]/15"
              />
            </label>
            <label className="block text-sm font-black">
              Password
              <span className="relative mt-2 block">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 10 : undefined}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border-2 border-[#a9abb2] bg-white px-4 py-3 pr-16 font-medium outline-none transition focus:border-[#3157d5] focus:ring-4 focus:ring-[#3157d5]/15"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-3 text-xs font-black text-[#3157d5]">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {mode === "register" ? (
              <label className="block text-sm font-black">
                Confirm password
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border-2 border-[#a9abb2] bg-white px-4 py-3 font-medium outline-none transition focus:border-[#3157d5] focus:ring-4 focus:ring-[#3157d5]/15"
                />
              </label>
            ) : (
              <label className="flex items-center gap-2 text-sm font-bold text-[#555d6d]">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 accent-[#3157d5]" />
                Keep me signed in
              </label>
            )}

            {mode === "register" ? <p className="text-xs font-medium leading-5 text-[#697080]">Use at least 10 characters, including an uppercase letter, lowercase letter, and number.</p> : null}
            {error ? <div role="alert" className="rounded-lg border-2 border-[#b84a3b] bg-[#ffe1dc] px-4 py-3 text-sm font-bold text-[#7f3026]">{error}</div> : null}

            <button disabled={isSubmitting} className="w-full rounded-lg border-2 border-[#172033] bg-[#ffcc4d] px-4 py-3.5 text-sm font-black shadow-[3px_3px_0_#172033] transition hover:translate-x-px hover:translate-y-px hover:shadow-[1px_1px_0_#172033] disabled:cursor-wait disabled:opacity-60">
              {isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
