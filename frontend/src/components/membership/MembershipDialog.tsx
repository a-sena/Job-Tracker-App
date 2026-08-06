import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiClient";

interface MembershipAllowance {
  id: string;
  label: string;
  used: number;
  limit: number;
  period: string;
}

interface MembershipPlan {
  id: string;
  name: string;
  eyebrow: string;
  monthlyPrice: number;
  annualPrice: number;
  futureMonthlyPrice: number | null;
  futureAnnualPrice: number | null;
  currency: string;
  isAvailable: boolean;
  features: string[];
}

interface MembershipDashboard {
  planId: string;
  planName: string;
  status: string;
  renewsAt: string | null;
  billingConfigured: boolean;
  canManageBilling: boolean;
  allowances: MembershipAllowance[];
  plans: MembershipPlan[];
}

interface MembershipDialogProps {
  apiBaseUrl: string;
  billingNotice?: "success" | "cancelled" | "portal" | null;
  onClose: () => void;
}

interface ProblemDetails {
  title?: string;
  detail?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as ProblemDetails;
    return problem.detail || problem.title || "Membership details could not be loaded.";
  } catch {
    return `Membership details could not be loaded (${response.status}).`;
  }
}

export default function MembershipDialog({
  apiBaseUrl,
  billingNotice = null,
  onClose,
}: MembershipDialogProps): JSX.Element {
  const [dashboard, setDashboard] = useState<MembershipDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [isRedirecting, setIsRedirecting] = useState<"checkout" | "portal" | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let isMounted = true;

    async function loadMembership(): Promise<void> {
      try {
        const response = await apiFetch(apiBaseUrl, "/api/membership", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(await readError(response));
        if (isMounted) setDashboard((await response.json()) as MembershipDashboard);
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Membership details could not be loaded.",
          );
        }
      }
    }

    void loadMembership();
    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, reloadToken]);

  useEffect(() => {
    if (billingNotice !== "success" || dashboard?.canManageBilling) return;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      setReloadToken((value) => value + 1);
      if (attempts >= 5) window.clearInterval(interval);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [billingNotice, dashboard?.canManageBilling]);

  async function openBilling(path: "/api/billing/checkout" | "/api/billing/portal"): Promise<void> {
    setError(null);
    setIsRedirecting(path.endsWith("checkout") ? "checkout" : "portal");
    try {
      const request: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      };
      if (path.endsWith("checkout")) {
        request.body = JSON.stringify({
          billingCycle: billingCycle === "annual" ? "Annual" : "Monthly",
          requestId: crypto.randomUUID(),
        });
      }
      const response = await apiFetch(apiBaseUrl, path, request);
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { url: string };
      window.location.assign(result.url);
    } catch (billingError) {
      setError(
        billingError instanceof Error
          ? billingError.message
          : "The secure Stripe page could not be opened.",
      );
      setIsRedirecting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-[#172033]/60 px-4 py-6 backdrop-blur-sm sm:py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-heading"
        className="mx-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border-2 border-[#172033] bg-[#f8f6ef] shadow-[8px_8px_0_#172033]"
      >
        <header className="relative overflow-hidden border-b-2 border-[#172033] bg-[#3157d5] px-6 py-7 text-white sm:px-9">
          <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full border-[30px] border-[#ffcc4d] opacity-90" />
          <div className="relative flex items-start justify-between gap-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ffdc78]">
                Your membership
              </p>
              <h2 id="membership-heading" className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Make every AI action count.
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-blue-100">
                Start free, keep tracking applications without limits, and upgrade only when the AI tools are earning their place in your job search.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close membership"
              onClick={onClose}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl font-black transition hover:bg-white hover:text-[#172033]"
            >
              ×
            </button>
          </div>
        </header>

        <div className="p-5 sm:p-8">
          {billingNotice === "success" ? (
            <div className="mb-5 rounded-xl border-2 border-[#2f7650] bg-[#dcf5e5] px-4 py-3 text-sm font-bold text-[#235b3d]">
              {dashboard?.canManageBilling
                ? "Membership activated. Your paid AI allowance is ready to use."
                : "Payment completed. Stripe is confirming your membership; this page will show the paid plan as soon as the signed webhook arrives."}
            </div>
          ) : null}
          {billingNotice === "cancelled" ? (
            <div className="mb-5 rounded-xl border-2 border-[#b68119] bg-[#fff4cb] px-4 py-3 text-sm font-bold text-[#79520b]">
              Checkout was cancelled. No membership change was made.
            </div>
          ) : null}
          {billingNotice === "portal" ? (
            <div className="mb-5 rounded-xl border-2 border-[#3157d5] bg-[#eef2ff] px-4 py-3 text-sm font-bold text-[#294aa9]">
              Billing changes are synchronized from Stripe and may take a few seconds to appear.
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-xl border-2 border-[#a54538] bg-[#ffe1dc] px-4 py-3 text-sm font-bold text-[#7f3026]">
              {error}
            </div>
          ) : null}

          {!dashboard && !error ? (
            <div className="flex min-h-52 items-center justify-center gap-3 text-sm font-black text-[#626979]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#3157d5] border-t-transparent" />
              Loading membership…
            </div>
          ) : null}

          {dashboard ? (
            <>
              <div className="mb-7 rounded-2xl border-2 border-[#172033] bg-white p-5 shadow-[3px_3px_0_#ffcc4d]">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#687083]">Current plan</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-2xl font-black tracking-[-0.03em]">{dashboard.planName}</p>
                      <span className="rounded-full bg-[#dcf5e5] px-2 py-1 text-[10px] font-black uppercase text-[#28633e]">
                        {dashboard.status}
                      </span>
                    </div>
                  </div>
                  <p className="max-w-sm text-xs font-semibold leading-5 text-[#687083]">
                    Only completed AI generations use an allowance. Application tracking remains unlimited.
                  </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {dashboard.allowances.map((allowance) => {
                    const remaining = Math.max(0, allowance.limit - allowance.used);
                    const progress = Math.min(100, (allowance.used / allowance.limit) * 100);
                    return (
                      <div key={allowance.id} className="rounded-xl border border-[#d9d8d2] bg-[#f8f7f2] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-extrabold leading-4">{allowance.label}</p>
                          <span className="text-[10px] font-bold text-[#747a88]">{allowance.period}</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#deddd7]">
                          <div className="h-full rounded-full bg-[#3157d5]" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="mt-2 text-xs font-bold text-[#555d6d]">
                          <span className="text-lg font-black text-[#172033]">{remaining}</span> remaining
                        </p>
                      </div>
                    );
                  })}
                </div>
                {dashboard.canManageBilling ? (
                  <button
                    type="button"
                    disabled={isRedirecting !== null}
                    onClick={() => void openBilling("/api/billing/portal")}
                    className="mt-5 rounded-xl border-2 border-[#172033] bg-white px-4 py-2.5 text-xs font-black shadow-[2px_2px_0_#172033] transition hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:cursor-wait disabled:opacity-60"
                  >
                    {isRedirecting === "portal" ? "Opening Stripe…" : "Manage billing in Stripe"}
                  </button>
                ) : null}
              </div>

              <div className="mb-5 flex justify-center">
                <div className="inline-flex rounded-full border-2 border-[#172033] bg-white p-1 shadow-[2px_2px_0_#172033]">
                  <button
                    type="button"
                    onClick={() => setBillingCycle("monthly")}
                    className={`rounded-full px-4 py-2 text-xs font-black transition ${billingCycle === "monthly" ? "bg-[#3157d5] text-white" : "text-[#626979] hover:text-[#172033]"}`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle("annual")}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition ${billingCycle === "annual" ? "bg-[#3157d5] text-white" : "text-[#626979] hover:text-[#172033]"}`}
                  >
                    Annual
                    <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${billingCycle === "annual" ? "bg-[#ffcc4d] text-[#172033]" : "bg-[#dcf5e5] text-[#28633e]"}`}>
                      2 months free
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {dashboard.plans.map((plan) => {
                  const isCurrent = plan.id === dashboard.planId;
                  const isFounding = plan.id === "FoundingMember";
                  const displayedPrice = billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
                  const futurePrice = billingCycle === "annual" ? plan.futureAnnualPrice : plan.futureMonthlyPrice;
                  const annualSaving = plan.monthlyPrice * 12 - plan.annualPrice;
                  const formatPrice = (amount: number, maximumFractionDigits = 0): string =>
                    new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: plan.currency,
                      minimumFractionDigits: 0,
                      maximumFractionDigits,
                    }).format(amount);
                  return (
                    <article
                      key={plan.id}
                      className={`relative flex min-h-[25rem] flex-col overflow-hidden rounded-2xl border-2 p-6 ${
                        isFounding
                          ? "border-[#172033] bg-[#fff4cb] shadow-[5px_5px_0_#ff6b57]"
                          : "border-[#c9c7bf] bg-white"
                      }`}
                    >
                      {isFounding ? (
                        <span className="absolute right-4 top-4 rounded-full border border-[#172033] bg-[#ffcc4d] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">
                          Limited launch plan
                        </span>
                      ) : null}
                      <p className="pr-36 text-[10px] font-black uppercase tracking-[0.16em] text-[#687083]">{plan.eyebrow}</p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">{plan.name}</h3>
                      <div className="mt-5 flex items-end gap-1">
                        <span className="text-4xl font-black tracking-[-0.05em]">{formatPrice(displayedPrice)}</span>
                        <span className="pb-1 text-sm font-bold text-[#626979]">USD / {billingCycle === "annual" ? "year" : "month"}</span>
                      </div>
                      {billingCycle === "annual" && plan.annualPrice > 0 ? (
                        <p className="mt-1 text-xs font-bold text-[#28633e]">
                          {formatPrice(plan.annualPrice / 12, 2)}/month equivalent · save {formatPrice(annualSaving)} yearly
                        </p>
                      ) : null}
                      {futurePrice ? (
                        <p className="mt-1 text-xs font-semibold text-[#8a5520]">
                          Planned regular price: {formatPrice(futurePrice)}/{billingCycle === "annual" ? "year" : "month"}. Founding price stays while active.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-[#687083]">No payment card required.</p>
                      )}

                      <ul className="mt-6 flex-1 space-y-3">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex gap-3 text-sm font-semibold leading-5 text-[#3e4658]">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dff3e6] text-xs font-black text-[#28633e]">✓</span>
                            {feature}
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        disabled={isCurrent || !plan.isAvailable || isRedirecting !== null || !isFounding}
                        onClick={() => void openBilling("/api/billing/checkout")}
                        className={`mt-6 w-full rounded-xl border-2 border-[#172033] px-4 py-3 text-sm font-black transition ${
                          isCurrent
                            ? "cursor-default bg-[#eef0f3] text-[#687083]"
                            : plan.isAvailable && isFounding
                              ? "bg-[#3157d5] text-white shadow-[3px_3px_0_#172033] hover:translate-x-px hover:translate-y-px hover:shadow-none"
                              : "cursor-not-allowed bg-[#172033] text-white opacity-75"
                        }`}
                      >
                        {isCurrent
                          ? "Your current plan"
                          : !isFounding
                            ? "Included with your account"
                            : isRedirecting === "checkout"
                              ? "Opening secure checkout…"
                              : plan.isAvailable
                                ? `Choose ${billingCycle} plan`
                                : "Stripe setup required"}
                      </button>
                    </article>
                  );
                })}
              </div>

              <p className="mt-6 text-center text-xs font-semibold leading-5 text-[#747a88]">
                Card details are entered only on Stripe Checkout. Rolevya never receives or stores your full card number.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
