import { useCallback, useEffect, useMemo, useState } from "react";
import ApplicationWorkflow from "./components/application/ApplicationWorkflow";
import JobKanbanBoard, {
  type JobApplication,
  type JobStatus,
} from "./components/jobs/JobKanbanBoard";

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
  return `${API_BASE_URL}${path}`;
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
  const [userId] = useState(getLocalUserId);
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
    setIsLoadingJobs(true);
    setJobsError(null);

    try {
      const [jobsResponse, categoriesResponse] = await Promise.all([
        fetch(apiUrl(`/api/jobs?userId=${encodeURIComponent(userId)}`), {
          headers: { Accept: "application/json" },
        }),
        fetch(
          apiUrl(
            `/api/application-categories?userId=${encodeURIComponent(userId)}`,
          ),
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
    void loadJobs();
  }, [loadJobs]);

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
      <header className="sticky top-0 z-40 border-b-2 border-[#172033] bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="#application-studio" className="flex items-center gap-2 sm:gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border-2 border-[#172033] bg-[#3157d5] text-base font-black text-white shadow-[3px_3px_0_#ffcc4d]">
              J
            </span>
            <span>
              <span className="block text-lg font-black tracking-tight">JobFlow</span>
              <span className="hidden text-xs font-medium text-[#626979] sm:block">
                Application workspace
              </span>
            </span>
          </a>
          <div className="flex items-center gap-2 sm:gap-3">
            <nav
              aria-label="Main navigation"
              className="flex items-center rounded-xl border border-[#d7d3c9] bg-[#f3f0e8] p-1"
            >
              <a
                href="#application-studio"
                aria-label="Prepare an application"
                className="group flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 text-xs font-bold text-[#172033] shadow-sm transition hover:text-[#3157d5] sm:px-3"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4 text-[#3157d5]"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2.83 2.83 0 0 0-4-4L4 16v4Z" />
                  <path strokeLinecap="round" d="m13.5 6.5 4 4" />
                </svg>
                <span className="hidden sm:inline">Prepare</span>
              </a>
              <a
                href="#application-log"
                aria-label="Open application log"
                className="group flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-bold text-[#555d6d] transition hover:bg-white/80 hover:text-[#172033] sm:px-3"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4 transition group-hover:text-[#c84736]"
                >
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path strokeLinecap="round" d="M8 3v4M16 3v4M8 11h8M8 15h5" />
                </svg>
                <span className="hidden sm:inline">Applications</span>
                {jobs.length > 0 ? (
                  <span className="hidden min-w-5 rounded-full bg-[#172033] px-1.5 py-0.5 text-center text-[9px] font-black text-white md:inline-block">
                    {jobs.length}
                  </span>
                ) : null}
              </a>
            </nav>

            <span aria-hidden="true" className="hidden h-8 w-px bg-[#d7d3c9] sm:block" />

            <div
              className="flex items-center gap-2 rounded-xl px-1 py-1 sm:pr-2"
              aria-label="Current user: Guest, local workspace"
              title="User accounts will be connected here"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff7058] text-xs font-black text-[#172033] ring-2 ring-white ring-offset-1 ring-offset-[#d7d3c9]">
                G
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-xs font-black leading-4 text-[#172033]">
                  Guest
                </span>
                <span className="block text-[10px] font-medium leading-3 text-[#737988]">
                  Local workspace
                </span>
              </span>
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
    </div>
  );
}
