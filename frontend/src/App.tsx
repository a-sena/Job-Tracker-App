import { useCallback, useEffect, useMemo, useState } from "react";
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
}

interface ExtractedJob {
  jobUrl: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  warnings: string[];
}

interface ProblemDetails {
  detail?: string;
  title?: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?.replace(/\/+$/, "") ?? "";
const LOCAL_USER_ID_KEY = "job-tracker.local-user-id";

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as ProblemDetails;
    return problem.detail || problem.title || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as T;
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
    appliedDate: job.createdAt,
    atsMatchScore: null,
    tailoredPdfUrl: null,
    status: job.status,
  };
}

function createManualReview(jobUrl: string): ExtractedJob {
  return {
    jobUrl,
    title: "",
    company: "",
    description: "",
    location: null,
    warnings: [
      "Automatic extraction was skipped. Complete the vacancy details manually.",
    ],
  };
}

function LinkIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
      />
    </svg>
  );
}

function SparklesIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18l-.813-2.096a4.5 4.5 0 0 0-2.591-2.591L3.5 12.5l2.096-.813a4.5 4.5 0 0 0 2.591-2.591L9 7l.813 2.096a4.5 4.5 0 0 0 2.591 2.591l2.096.813-2.096.813a4.5 4.5 0 0 0-2.591 2.591ZM18.259 8.715 18 9.5l-.259-.785a3.375 3.375 0 0 0-2.456-2.456L14.5 6l.785-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.5l.259.785a3.375 3.375 0 0 0 2.456 2.456L21.5 6l-.785.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  );
}

export default function App(): JSX.Element {
  const [jobs, setJobs] = useState<ApiJobApplication[]>([]);
  const [boardRevision, setBoardRevision] = useState(0);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [review, setReview] = useState<ExtractedJob | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const boardJobs = useMemo(() => jobs.map(toBoardJob), [jobs]);

  const loadJobs = useCallback(async (): Promise<void> => {
    setIsLoadingJobs(true);
    setJobsError(null);

    try {
      const loadedJobs = await apiRequest<ApiJobApplication[]>("/api/jobs");
      setJobs(loadedJobs);
      setBoardRevision((revision) => revision + 1);
    } catch (error) {
      setJobsError(
        error instanceof Error ? error.message : "Could not load applications.",
      );
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setSuccessMessage(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  async function handleExtract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExtractionError(null);
    setSuccessMessage(null);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(jobUrl.trim());
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error();
      }
    } catch {
      setExtractionError("Enter a complete HTTP or HTTPS job-posting URL.");
      return;
    }

    setIsExtracting(true);
    try {
      const extracted = await apiRequest<ExtractedJob>("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl: parsedUrl.toString() }),
      });
      setReview(extracted);
    } catch (error) {
      setExtractionError(
        error instanceof Error
          ? error.message
          : "The vacancy could not be extracted.",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) {
      return;
    }

    if (!review.title.trim() || !review.company.trim() || !review.description.trim()) {
      setExtractionError(
        "Title, company, and job description are required before saving.",
      );
      return;
    }

    setIsSaving(true);
    setExtractionError(null);

    try {
      const created = await apiRequest<ApiJobApplication>("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getLocalUserId(),
          jobUrl: review.jobUrl,
          title: review.title.trim(),
          company: review.company.trim(),
          description: review.description.trim(),
          location: review.location?.trim() || null,
        }),
      });

      setJobs((currentJobs) => [created, ...currentJobs]);
      setBoardRevision((revision) => revision + 1);
      setReview(null);
      setJobUrl("");
      setSuccessMessage(`${created.title} was added to Applied.`);
    } catch (error) {
      setExtractionError(
        error instanceof Error
          ? error.message
          : "The application could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function updateReview(
    field: "title" | "company" | "description" | "location",
    value: string,
  ) {
    setReview((current) =>
      current
        ? {
            ...current,
            [field]: field === "location" ? value || null : value,
          }
        : current,
    );
  }

  function handleStatusConfirmed(jobId: string, status: JobStatus) {
    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobId ? { ...job, status } : job)),
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm">
              J
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-950">
                JobFlow
              </p>
              <p className="text-xs text-slate-500">Application workspace</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 sm:flex">
            <SparklesIcon />
            CV tailoring ready
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl bg-slate-950 shadow-xl">
          <div className="grid lg:grid-cols-[1fr_0.85fr]">
            <div className="px-6 py-8 sm:px-10 sm:py-10">
              <div className="mb-6 max-w-2xl">
                <span className="inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-300 ring-1 ring-inset ring-blue-400/25">
                  Add an application
                </span>
                <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Paste a vacancy. Build your job search pipeline.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                  We extract the vacancy details for review before anything is
                  saved. You stay in control of every application.
                </p>
              </div>

              <form onSubmit={handleExtract} className="flex flex-col gap-3 sm:flex-row">
                <label className="sr-only" htmlFor="job-url">
                  Job posting URL
                </label>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                    <LinkIcon />
                  </span>
                  <input
                    id="job-url"
                    type="url"
                    required
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="https://company.no/jobs/software-engineer"
                    className="h-12 w-full rounded-xl border border-white/15 bg-white/10 pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white/[0.13] focus:ring-2 focus:ring-blue-400/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isExtracting}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-wait disabled:opacity-60"
                >
                  <SparklesIcon />
                  {isExtracting ? "Extracting…" : "Extract vacancy"}
                </button>
              </form>

              {extractionError ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  <p className="flex-1">{extractionError}</p>
                  {!review && jobUrl.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReview(createManualReview(jobUrl.trim()));
                        setExtractionError(null);
                      }}
                      className="font-semibold text-white underline underline-offset-4"
                    >
                      Enter manually
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/10 bg-white/[0.04] px-6 py-8 sm:px-10 lg:border-l lg:border-t-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Your pipeline
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-2xl font-bold text-white">{jobs.length}</p>
                  <p className="mt-1 text-xs text-slate-400">Tracked roles</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-2xl font-bold text-green-300">
                    {jobs.filter((job) => job.status === "Interviewing").length}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Interviews</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-400">
                ATS scoring and tailored PDF actions become available after a
                Master CV is connected in the next workflow.
              </p>
            </div>
          </div>
        </section>

        {successMessage ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
          >
            {successMessage}
          </div>
        ) : null}

        {review ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                  Review before saving
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Confirm the extracted vacancy
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReview(null);
                  setExtractionError(null);
                }}
                className="self-start rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>

            {review.warnings.length > 0 ? (
              <ul className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-3 text-sm text-yellow-900">
                {review.warnings.map((warning) => (
                  <li key={warning} className="list-disc">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            <form onSubmit={handleCreate} className="mt-6 grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Job title
                  <input
                    required
                    maxLength={300}
                    value={review.title}
                    onChange={(event) => updateReview("title", event.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Company
                  <input
                    required
                    maxLength={200}
                    value={review.company}
                    onChange={(event) => updateReview("company", event.target.value)}
                    className="h-11 rounded-lg border border-slate-300 px-3 font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Location
                <input
                  maxLength={200}
                  value={review.location ?? ""}
                  onChange={(event) => updateReview("location", event.target.value)}
                  placeholder="Optional"
                  className="h-11 rounded-lg border border-slate-300 px-3 font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Job description
                <textarea
                  required
                  rows={9}
                  value={review.description}
                  onChange={(event) =>
                    updateReview("description", event.target.value)
                  }
                  className="resize-y rounded-lg border border-slate-300 px-3 py-3 font-normal leading-6 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Add to application board"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                Applications
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                Your job search board
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadJobs()}
              disabled={isLoadingJobs}
              className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingJobs ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {jobsError ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {jobsError}
            </div>
          ) : null}

          {isLoadingJobs && jobs.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-[28rem] animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : (
            <JobKanbanBoard
              key={boardRevision}
              initialJobs={boardJobs}
              apiBaseUrl={API_BASE_URL}
              onStatusChangeConfirmed={handleStatusConfirmed}
            />
          )}
        </section>
      </main>
    </div>
  );
}
