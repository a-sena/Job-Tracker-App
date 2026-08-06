import { useCallback, useEffect, useMemo, useState } from "react";
import ApplicationWorkflow from "./components/application/ApplicationWorkflow";
import AuthPage, { type AuthUser } from "./components/auth/AuthPage";
import ChangePasswordDialog from "./components/auth/ChangePasswordDialog";
import MembershipDialog from "./components/membership/MembershipDialog";
import JobKanbanBoard, {
  type JobApplication,
  type JobStatus,
} from "./components/jobs/JobKanbanBoard";
import { apiFetch, apiUrl as buildApiUrl, clearCsrfToken } from "./lib/apiClient";

interface ApiJobApplication {
  id: string;
  userId: string;
  jobUrl: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  atsMatchScore: number | null;
  tailoredCvId: string | null;
  missingKeywords: string[];
  categoryId: string | null;
  categoryName: string | null;
}

interface ApplicationCategory {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

interface ProblemDetails {
  detail?: string;
  title?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?.replace(/\/+$/, "") ?? "";
const LOCAL_USER_ID_KEY = "job-tracker.local-user-id";
const ALL_CATEGORIES = "all";
const UNCATEGORIZED = "uncategorized";

type CategoryFilter = typeof ALL_CATEGORIES | typeof UNCATEGORIZED | string;

function apiUrl(path: string): string {
  return buildApiUrl(API_BASE_URL, path);
}

function isUncategorizedJob(job: ApiJobApplication): boolean {
  return (
    !job.categoryId ||
    job.categoryName?.trim().toLocaleLowerCase() === UNCATEGORIZED
  );
}

async function readApiError(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as ProblemDetails;
    return problem.detail || problem.title || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function getLocalUserId(): string {
  const existing = localStorage.getItem(LOCAL_USER_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "00000000-0000-4000-8000-000000000001";

  localStorage.setItem(LOCAL_USER_ID_KEY, generated);
  return generated;
}

function toBoardJob(job: ApiJobApplication): JobApplication {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    jobUrl: job.jobUrl,
    description: job.description,
    location: job.location,
    categoryName: job.categoryName,
    appliedDate: job.createdAt,
    atsMatchScore: job.atsMatchScore,
    missingKeywords: job.missingKeywords ?? [],
    tailoredPdfUrl: job.tailoredCvId
      ? apiUrl(`/api/jobs/${encodeURIComponent(job.id)}/tailored-cv/pdf`)
      : null,
    status: job.status,
  };
}

export default function App(): JSX.Element {
  const [legacyUserId] = useState(getLocalUserId);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isMembershipDialogOpen, setIsMembershipDialogOpen] = useState(false);
  const [billingNotice, setBillingNotice] = useState<"success" | "cancelled" | "portal" | null>(() => {
    const value = new URLSearchParams(window.location.search).get("billing");
    return value === "success" || value === "cancelled" || value === "portal"
      ? value
      : null;
  });
  const userId = authUser?.id ?? "";
  const [jobs, setJobs] = useState<ApiJobApplication[]>([]);
  const [categories, setCategories] = useState<ApplicationCategory[]>([]);
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>(ALL_CATEGORIES);
  const [boardRevision, setBoardRevision] = useState(0);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    if (categoryFilter === ALL_CATEGORIES) {
      return jobs;
    }
    if (categoryFilter === UNCATEGORIZED) {
      return jobs.filter(isUncategorizedJob);
    }
    return jobs.filter((job) => job.categoryId === categoryFilter);
  }, [categoryFilter, jobs]);

  const boardJobs = useMemo(() => filteredJobs.map(toBoardJob), [filteredJobs]);

  const categoryCount = useCallback(
    (categoryId: CategoryFilter): number => {
      if (categoryId === ALL_CATEGORIES) {
        return jobs.length;
      }
      if (categoryId === UNCATEGORIZED) {
        return jobs.filter(isUncategorizedJob).length;
      }
      return jobs.filter((job) => job.categoryId === categoryId).length;
    },
    [jobs],
  );

  const loadJobs = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsLoadingJobs(true);
    setJobsError(null);

    try {
      const [jobsResponse, categoriesResponse] = await Promise.all([
        apiFetch(API_BASE_URL, `/api/jobs?userId=${encodeURIComponent(userId)}`, {
          headers: { Accept: "application/json" },
        }),
        apiFetch(
          API_BASE_URL,
          `/api/application-categories?userId=${encodeURIComponent(userId)}`,
          { headers: { Accept: "application/json" } },
        ),
      ]);
      if (!jobsResponse.ok) {
        throw new Error(await readApiError(jobsResponse));
      }
      if (!categoriesResponse.ok) {
        throw new Error(await readApiError(categoriesResponse));
      }

      const loadedJobs = (await jobsResponse.json()) as ApiJobApplication[];
      const loadedCategories =
        (await categoriesResponse.json()) as ApplicationCategory[];
      setJobs(loadedJobs);
      setCategories(loadedCategories);
      setCategoryFilter((current) =>
        current === ALL_CATEGORIES ||
        current === UNCATEGORIZED ||
        loadedCategories.some((category) => category.id === current)
          ? current
          : ALL_CATEGORIES,
      );
      setBoardRevision((revision) => revision + 1);
    } catch (error) {
      setJobsError(
        error instanceof Error ? error.message : "Could not load applications.",
      );
    } finally {
      setIsLoadingJobs(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authUser) void loadJobs();
  }, [authUser, loadJobs]);

  useEffect(() => {
    let isMounted = true;
    async function restoreSession(): Promise<void> {
      try {
        const response = await apiFetch(API_BASE_URL, "/api/auth/me", {
          headers: { Accept: "application/json" },
        });
        if (response.ok && isMounted) {
          setAuthUser((await response.json()) as AuthUser);
        }
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    }
    void restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!billingNotice) return;
    setIsMembershipDialogOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("billing");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [billingNotice]);

  async function logout(): Promise<void> {
    try {
      const response = await apiFetch(API_BASE_URL, "/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      clearCsrfToken(API_BASE_URL);
      setAuthUser(null);
      setJobs([]);
      setCategories([]);
      setIsProfileOpen(false);
    } catch {
      setIsProfileOpen(false);
      window.alert("You could not be logged out. Check the API connection and try again.");
    }
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f0e8] text-[#172033]">
        <div className="flex items-center gap-3 text-sm font-black">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#3157d5] border-t-transparent" />
          Opening your workspace…
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthPage
        apiBaseUrl={API_BASE_URL}
        legacyUserId={legacyUserId}
        onAuthenticated={(user, isNewAccount) => {
          if (isNewAccount) localStorage.removeItem(LOCAL_USER_ID_KEY);
          setAuthUser(user);
        }}
      />
    );
  }

  function handleStatusConfirmed(jobId: string, status: JobStatus) {
    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobId ? { ...job, status } : job)),
    );
  }

  function handleApplicationDeleted(jobId: string) {
    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));
    setBoardRevision((revision) => revision + 1);
  }

  return (
    <div className="min-h-screen bg-[#f3f0e8] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#e4e1da] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#application-studio" className="group flex items-center gap-3" aria-label="JobFlow home">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#172033] text-base font-black text-white shadow-sm transition group-hover:-translate-y-0.5">
              J
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#ffcc4d]" />
            </span>
            <span className="hidden sm:block">
              <span className="block text-[17px] font-black tracking-[-0.025em]">JobFlow</span>
              <span className="block text-[10px] font-semibold tracking-wide text-[#7a808d]">APPLICATION WORKSPACE</span>
            </span>
          </a>

          <div className="flex items-center gap-2 sm:gap-4">
            <nav aria-label="Main navigation" className="flex items-center gap-1 rounded-full bg-[#f3f4f6] p-1">
              <a
                href="#application-studio"
                aria-label="Prepare an application"
                className="flex h-10 items-center gap-2 rounded-full bg-[#3157d5] px-3 text-xs font-bold text-white shadow-[0_4px_12px_rgba(49,87,213,0.22)] transition hover:bg-[#294bc0] sm:px-4"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2.83 2.83 0 0 0-4-4L4 16v4Z" />
                  <path strokeLinecap="round" d="m13.5 6.5 4 4" />
                </svg>
                <span className="hidden sm:inline">Prepare</span>
              </a>
              <a
                href="#application-log"
                aria-label="Open application log"
                className="group flex h-10 items-center gap-2 rounded-full px-3 text-xs font-bold text-[#555d6d] transition hover:bg-white hover:text-[#172033] sm:px-4"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path strokeLinecap="round" d="M8 3v4M16 3v4M8 11h8M8 15h5" />
                </svg>
                <span className="hidden sm:inline">Applications</span>
                {jobs.length > 0 ? (
                  <span className="flex min-w-5 items-center justify-center rounded-full bg-[#3157d5] px-1.5 py-0.5 text-[9px] font-black text-white">
                    {jobs.length}
                  </span>
                ) : null}
              </a>
            </nav>

            <div className="relative">
              <button
                type="button"
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                onClick={() => setIsProfileOpen((open) => !open)}
                className="group flex h-12 items-center gap-2.5 rounded-full border border-[#e2e4e8] bg-white p-1.5 pr-2 text-left shadow-sm transition hover:border-[#c8ccd4] hover:shadow-md sm:pr-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff846f] to-[#ff604c] text-xs font-black text-white shadow-sm">
                  {authUser.email.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-32 text-left md:block">
                  <span className="block truncate text-xs font-extrabold leading-4 text-[#172033]">
                    {authUser.email.split("@")[0]}
                  </span>
                  <span className="block text-[10px] font-medium leading-3 text-[#7a808d]">My account</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`hidden h-4 w-4 text-[#8b909b] transition-transform sm:block ${isProfileOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {isProfileOpen ? (
                <div role="menu" className="absolute right-0 mt-3 w-72 origin-top-right overflow-hidden rounded-2xl border border-[#e1e3e7] bg-white p-2 shadow-[0_18px_50px_rgba(23,32,51,0.16)]">
                  <div className="flex items-center gap-3 rounded-xl bg-[#f6f5f1] px-3 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff846f] to-[#ff604c] text-sm font-black text-white">
                      {authUser.email.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[#172033]">{authUser.email.split("@")[0]}</p>
                      <p className="truncate text-[11px] font-medium text-[#737988]">{authUser.email}</p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <button type="button" role="menuitem" onClick={() => { setIsMembershipDialogOpen(true); setIsProfileOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#30384b] transition hover:bg-[#fff7d8] hover:text-[#8a5520]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff4cb] text-[#8a5520]">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" /><path strokeLinecap="round" d="M4 9h16M8 15h3" /></svg>
                      </span>
                      <span className="flex-1">
                        <span className="block">Membership</span>
                        <span className="block text-[10px] font-semibold text-[#858a96]">Plan and AI usage</span>
                      </span>
                      <span className="rounded-full bg-[#eef0f3] px-2 py-1 text-[9px] font-black uppercase text-[#687083]">Free</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setIsPasswordDialogOpen(true); setIsProfileOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#30384b] transition hover:bg-[#eef2ff] hover:text-[#3157d5]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3157d5]">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="5" y="10" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></svg>
                      </span>
                      Change password
                    </button>
                    <button type="button" role="menuitem" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#a54538] transition hover:bg-[#fff0ed]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff0ed] text-[#c84736]">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></svg>
                      </span>
                      Log out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <div id="application-studio" className="scroll-mt-24">
          <ApplicationWorkflow
            userId={userId}
            apiBaseUrl={API_BASE_URL}
            onApplicationLogged={loadJobs}
          />
        </div>

        <section
          id="application-log"
          aria-labelledby="application-log-heading"
          className="mt-16 scroll-mt-24 border-t-2 border-[#172033] pt-10"
        >
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c84736]">
                Application log
              </p>
              <h2
                id="application-log-heading"
                className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#172033]"
              >
                Track what happens next.
              </h2>
              <p className="mt-2 text-sm font-medium text-[#626979]">
                Saved applications live here. Drag each card as its status changes.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start">
              <div className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-xs font-bold">
                <span className="text-xl font-black">{filteredJobs.length}</span>{" "}
                {categoryFilter === ALL_CATEGORIES ? "tracked" : `of ${jobs.length}`}
              </div>
              <button
                type="button"
                onClick={() => void loadJobs()}
                disabled={isLoadingJobs}
                className="rounded-md border-2 border-[#172033] bg-white px-4 py-2.5 text-xs font-black shadow-[2px_2px_0_#172033] transition hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:cursor-wait disabled:opacity-60"
              >
                {isLoadingJobs ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {jobsError ? (
            <div
              role="alert"
              className="mb-4 rounded-md border-2 border-[#a54538] bg-[#ffe1dc] px-4 py-3 text-sm font-bold text-[#7f3026]"
            >
              {jobsError}
            </div>
          ) : null}

          {!jobsError ? (
            <div className="mb-5 rounded-lg border-2 border-[#172033] bg-white p-3 shadow-[3px_3px_0_#172033]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#626979]">
                  Application groups
                </p>
                <p className="hidden text-xs font-semibold text-[#626979] sm:block">
                  Choose a group without changing the status board.
                </p>
              </div>
              <div
                role="group"
                aria-label="Filter applications by group"
                className="mt-3 flex gap-2 overflow-x-auto pb-1"
              >
                {[
                  { id: ALL_CATEGORIES, name: "All applications" },
                  ...categories
                    .filter(
                      (category) =>
                        category.name.trim().toLocaleLowerCase() !==
                        UNCATEGORIZED,
                    )
                    .map((category) => ({
                      id: category.id,
                      name: category.name,
                    })),
                  { id: UNCATEGORIZED, name: "Uncategorized" },
                ].map((category) => {
                  const isActive = categoryFilter === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setCategoryFilter(category.id)}
                      className={[
                        "inline-flex shrink-0 items-center gap-2 rounded-full border-2 px-3 py-2 text-xs font-black transition",
                        isActive
                          ? "border-[#172033] bg-[#3157d5] text-white shadow-[2px_2px_0_#ffcc4d]"
                          : "border-[#a8abb3] bg-[#f8f7f2] text-[#404658] hover:border-[#172033] hover:bg-[#eef2ff]",
                      ].join(" ")}
                    >
                      <span>{category.name}</span>
                      <span
                        className={[
                          "rounded-full px-1.5 py-0.5 text-[10px]",
                          isActive
                            ? "bg-white text-[#3157d5]"
                            : "bg-[#deddd8] text-[#404658]",
                        ].join(" ")}
                      >
                        {categoryCount(category.id)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isLoadingJobs && jobs.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-[28rem] animate-pulse rounded-lg border-2 border-[#c8c8c5] bg-white"
                />
              ))}
            </div>
          ) : (
            <JobKanbanBoard
              key={`${boardRevision}:${categoryFilter}`}
              initialJobs={boardJobs}
              apiBaseUrl={API_BASE_URL}
              onStatusChangeConfirmed={handleStatusConfirmed}
              onApplicationDeleted={handleApplicationDeleted}
            />
          )}
        </section>
      </main>
      {isPasswordDialogOpen ? (
        <ChangePasswordDialog
          apiBaseUrl={API_BASE_URL}
          onClose={() => setIsPasswordDialogOpen(false)}
        />
      ) : null}
      {isMembershipDialogOpen ? (
        <MembershipDialog
          apiBaseUrl={API_BASE_URL}
          billingNotice={billingNotice}
          onClose={() => {
            setIsMembershipDialogOpen(false);
            setBillingNotice(null);
          }}
        />
      ) : null}
    </div>
  );
}
