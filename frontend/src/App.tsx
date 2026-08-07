import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ApplicationWorkflow from "./components/application/ApplicationWorkflow";
import AuthPage, { type AuthUser } from "./components/auth/AuthPage";
import ChangePasswordDialog from "./components/auth/ChangePasswordDialog";
import MembershipDialog from "./components/membership/MembershipDialog";
import RolevyaLogo from "./components/branding/RolevyaLogo";
import JobKanbanBoard, {
  type JobApplication,
  type JobStatus,
  type WorkArrangement,
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
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterLinkedInUrl: string | null;
  salaryRange: string | null;
  workArrangement: WorkArrangement;
  personalNotes: string | null;
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
    recruiterName: job.recruiterName,
    recruiterEmail: job.recruiterEmail,
    recruiterLinkedInUrl: job.recruiterLinkedInUrl,
    salaryRange: job.salaryRange,
    workArrangement: job.workArrangement,
    personalNotes: job.personalNotes,
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
  const profileMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!isProfileOpen) return;

    function closeProfileMenu(event: PointerEvent): void {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    }

    function closeProfileMenuWithKeyboard(event: KeyboardEvent): void {
      if (event.key === "Escape") setIsProfileOpen(false);
    }

    document.addEventListener("pointerdown", closeProfileMenu);
    document.addEventListener("keydown", closeProfileMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeProfileMenu);
      document.removeEventListener("keydown", closeProfileMenuWithKeyboard);
    };
  }, [isProfileOpen]);

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

  function handleApplicationDetailsUpdated(updated: JobApplication) {
    setJobs((currentJobs) =>
      currentJobs.map((job) => job.id === updated.id
        ? {
            ...job,
            location: updated.location,
            recruiterName: updated.recruiterName,
            recruiterEmail: updated.recruiterEmail,
            recruiterLinkedInUrl: updated.recruiterLinkedInUrl,
            salaryRange: updated.salaryRange,
            workArrangement: updated.workArrangement,
            personalNotes: updated.personalNotes,
          }
        : job),
    );
  }

  function handleApplicationDeleted(jobId: string) {
    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== jobId));
    setBoardRevision((revision) => revision + 1);
  }

  return (
    <div className="min-h-screen bg-[#f3f0e8] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#dedbd3] bg-[#fbfaf7]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[78px] max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a
            href="#application-studio"
            className="rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#3157d5] focus-visible:ring-offset-4"
            aria-label="Rolevya home"
          >
            <RolevyaLogo
              showDescriptor
              wordmarkClassName="hidden sm:block"
            />
          </a>

          <div className="flex h-full items-center gap-3 sm:gap-6">
            <nav
              aria-label="Main navigation"
              className="flex h-full items-center gap-4 sm:gap-7"
            >
              <a
                href="#application-studio"
                aria-label="Prepare an application"
                className="group relative flex h-full items-center gap-2 text-xs font-extrabold text-[#4f5666] outline-none transition-colors hover:text-[#172033] focus-visible:text-[#3157d5] sm:text-sm"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2.83 2.83 0 0 0-4-4L4 16v4Z" />
                  <path strokeLinecap="round" d="m13.5 6.5 4 4" />
                </svg>
                <span className="hidden sm:inline">Prepare</span>
                <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-[#3157d5] transition-transform group-hover:scale-x-100 group-focus-visible:scale-x-100" />
              </a>
              <a
                href="#application-log"
                aria-label="Open application log"
                className="group relative flex h-full items-center gap-2 text-xs font-extrabold text-[#4f5666] outline-none transition-colors hover:text-[#172033] focus-visible:text-[#3157d5] sm:text-sm"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path strokeLinecap="round" d="M8 3v4M16 3v4M8 11h8M8 15h5" />
                </svg>
                <span className="hidden sm:inline">Applications</span>
                {jobs.length > 0 ? (
                  <span className="flex min-w-5 items-center justify-center rounded-full bg-[#172033] px-1.5 py-0.5 text-[9px] font-black text-white">
                    {jobs.length}
                  </span>
                ) : null}
                <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-[#3157d5] transition-transform group-hover:scale-x-100 group-focus-visible:scale-x-100" />
              </a>
            </nav>

            <div ref={profileMenuRef} className="relative flex h-11 items-center border-l border-[#dedbd3] pl-3 sm:pl-6">
              <button
                type="button"
                aria-label="Open account menu"
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                onClick={() => setIsProfileOpen((open) => !open)}
                className="group flex items-center gap-2.5 rounded-lg text-left outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-[#3157d5] focus-visible:ring-offset-4"
              >
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3157d5] to-[#7148c8] text-xs font-black text-white shadow-[0_3px_10px_rgba(49,87,213,0.24)]">
                  {authUser.email.charAt(0).toUpperCase()}
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#fbfaf7] bg-[#3aa66b]" />
                </span>
                <span className="hidden max-w-36 text-left lg:block">
                  <span className="block truncate text-xs font-black leading-4 text-[#172033]">
                    {authUser.email.split("@")[0]}
                  </span>
                  <span className="block text-[10px] font-semibold leading-4 text-[#7a808d]">
                    Personal workspace
                  </span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`hidden h-4 w-4 text-[#858b98] transition-transform sm:block ${isProfileOpen ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {isProfileOpen ? (
                <div role="menu" className="absolute right-0 top-[calc(100%+0.75rem)] w-[min(20rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-[1.25rem] border border-[#dfe1e6] bg-white shadow-[0_24px_65px_rgba(23,32,51,0.18)]">
                  <div className="border-b border-[#e5e6e9] bg-gradient-to-br from-[#f4f6ff] to-[#fbfaf7] p-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3157d5] to-[#7148c8] text-sm font-black text-white">
                        {authUser.email.charAt(0).toUpperCase()}
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#3aa66b]" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black tracking-[-0.015em] text-[#172033]">
                          {authUser.email.split("@")[0]}
                        </p>
                        <p className="truncate text-[11px] font-medium text-[#687083]">{authUser.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    <p className="px-3 pb-1 pt-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#9297a2]">
                      Account
                    </p>
                    <button type="button" role="menuitem" onClick={() => { setIsMembershipDialogOpen(true); setIsProfileOpen(false); }} className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f4f6ff] focus-visible:bg-[#f4f6ff] focus-visible:outline-none">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 shrink-0 text-[#3157d5]"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" /><path strokeLinecap="round" d="M4 9h16M8 15h3" /></svg>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold text-[#273044]">Membership</span>
                        <span className="block text-[10px] font-medium text-[#7a808d]">Plan, billing and AI allowance</span>
                      </span>
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#a2a6af] transition-transform group-hover:translate-x-0.5"><path fillRule="evenodd" d="M7.23 4.21a.75.75 0 0 1 1.06.02l5 5.25a.75.75 0 0 1 0 1.04l-5 5.25a.75.75 0 1 1-1.08-1.04L11.72 10 7.21 5.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setIsPasswordDialogOpen(true); setIsProfileOpen(false); }} className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f4f6ff] focus-visible:bg-[#f4f6ff] focus-visible:outline-none">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 shrink-0 text-[#3157d5]"><rect x="5" y="10" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></svg>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold text-[#273044]">Security</span>
                        <span className="block text-[10px] font-medium text-[#7a808d]">Change your password</span>
                      </span>
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#a2a6af] transition-transform group-hover:translate-x-0.5"><path fillRule="evenodd" d="M7.23 4.21a.75.75 0 0 1 1.06.02l5 5.25a.75.75 0 0 1 0 1.04l-5 5.25a.75.75 0 1 1-1.08-1.04L11.72 10 7.21 5.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" /></svg>
                    </button>

                    <div className="my-2 border-t border-[#ececef]" />
                    <button type="button" role="menuitem" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-extrabold text-[#a54538] transition hover:bg-[#fff2ef] focus-visible:bg-[#fff2ef] focus-visible:outline-none">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></svg>
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
              onApplicationDetailsUpdated={handleApplicationDetailsUpdated}
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
