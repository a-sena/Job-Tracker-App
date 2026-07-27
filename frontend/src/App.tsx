import { useCallback, useEffect, useMemo, useState } from "react";
import JobKanbanBoard, {
  type JobApplication,
  type JobStatus,
} from "./components/jobs/JobKanbanBoard";
import MasterCvEditor, {
  type MasterCv,
} from "./components/cvs/MasterCvEditor";

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

interface TailoredCv {
  id: string;
  masterCvId: string;
  jobApplicationId: string;
  summary: string;
  atsMatchScore: number;
  missingKeywords: string[];
  pdfFileName: string;
  createdAt: string;
  updatedAt: string;
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
    atsMatchScore: job.atsMatchScore,
    missingKeywords: job.missingKeywords ?? [],
    tailoredPdfUrl: job.tailoredCvId
      ? apiUrl(`/api/jobs/${encodeURIComponent(job.id)}/tailored-cv/pdf`)
      : null,
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

export default function App(): JSX.Element {
  const [userId] = useState(getLocalUserId);
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
  const [masterCv, setMasterCv] = useState<MasterCv | null>(null);
  const [isMasterCvLoading, setIsMasterCvLoading] = useState(true);
  const [showMasterCvEditor, setShowMasterCvEditor] = useState(false);

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
    let isCancelled = false;

    async function loadMasterCv(): Promise<void> {
      setIsMasterCvLoading(true);
      try {
        const response = await fetch(
          apiUrl(`/api/master-cvs/${encodeURIComponent(userId)}`),
          { headers: { Accept: "application/json" } },
        );

        if (response.status === 404) {
          return;
        }

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        if (!isCancelled) {
          setMasterCv((await response.json()) as MasterCv);
        }
      } catch (error) {
        if (!isCancelled) {
          setJobsError(
            error instanceof Error
              ? error.message
              : "Could not load the Master CV.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsMasterCvLoading(false);
        }
      }
    }

    void loadMasterCv();
    return () => {
      isCancelled = true;
    };
  }, [userId]);

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
          userId,
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

  async function handleTailorCv(jobId: string): Promise<void> {
    if (!masterCv) {
      setShowMasterCvEditor(true);
      throw new Error("Save your Master CV before tailoring this application.");
    }

    const tailoredCv = await apiRequest<TailoredCv>(
      `/api/jobs/${encodeURIComponent(jobId)}/tailored-cv`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    setJobs((currentJobs) =>
      currentJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              atsMatchScore: tailoredCv.atsMatchScore,
              tailoredCvId: tailoredCv.id,
              missingKeywords: tailoredCv.missingKeywords,
            }
          : job,
      ),
    );
    setBoardRevision((revision) => revision + 1);
    const missingKeywordMessage =
      tailoredCv.missingKeywords.length > 0
        ? ` Unsupported requirements still missing: ${tailoredCv.missingKeywords
            .slice(0, 3)
            .join(", ")}${tailoredCv.missingKeywords.length > 3 ? "…" : ""}.`
        : " No unsupported priority keywords were identified.";
    setSuccessMessage(
      `Tailored CV generated with a ${Math.round(tailoredCv.atsMatchScore)}% ATS match.${missingKeywordMessage}`,
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f0e8] text-[#172033]">
      <header className="sticky top-0 z-40 border-b-2 border-[#172033] bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border-2 border-[#172033] bg-[#3157d5] text-base font-black text-white shadow-[3px_3px_0_#ffcc4d]">
              J
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-[#172033]">
                JobFlow
              </p>
              <p className="text-xs font-medium text-[#626979]">Application workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowMasterCvEditor((visible) => !visible)}
            className="hidden items-center gap-2 rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-4 py-2 text-xs font-bold text-[#172033] shadow-[3px_3px_0_#172033] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#172033] sm:flex"
          >
            {isMasterCvLoading
              ? "Checking Master CV…"
              : masterCv
                ? "Master CV ready"
                : "Add Master CV"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-xl border-2 border-[#172033] bg-white shadow-[8px_8px_0_#172033]">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-[#3157d5] px-6 py-9 sm:px-10 sm:py-12">
              <div className="mb-6 max-w-2xl">
                <span className="inline-block border-2 border-[#172033] bg-[#ffcc4d] px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#172033]">
                  Add an application
                </span>
                <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl">
                  Make every application count.
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#e3e9ff] sm:text-base">
                  Paste the vacancy link below. You can review the title,
                  company, and description before saving it.
                </p>
              </div>

              <form onSubmit={handleExtract} className="flex flex-col gap-3 sm:flex-row">
                <label className="sr-only" htmlFor="job-url">
                  Job posting URL
                </label>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#4d5566]">
                    <LinkIcon />
                  </span>
                  <input
                    id="job-url"
                    type="url"
                    required
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="https://company.no/jobs/software-engineer"
                    className="h-12 w-full rounded-md border-2 border-[#172033] bg-white pl-12 pr-4 text-sm text-[#172033] outline-none transition placeholder:text-[#9298a5] focus:ring-4 focus:ring-[#ffcc4d]/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isExtracting}
                  className="inline-flex h-12 items-center justify-center rounded-md border-2 border-[#172033] bg-[#ff7058] px-6 text-sm font-black text-[#172033] shadow-[3px_3px_0_#172033] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#172033] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#3157d5] disabled:cursor-wait disabled:opacity-60"
                >
                  {isExtracting ? "Extracting…" : "Extract vacancy"}
                </button>
              </form>

              {extractionError ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border-2 border-[#172033] bg-[#ffe4df] px-4 py-3 text-sm font-medium text-[#7f3026]">
                  <p className="flex-1">{extractionError}</p>
                  {!review && jobUrl.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReview(createManualReview(jobUrl.trim()));
                        setExtractionError(null);
                      }}
                      className="font-semibold underline underline-offset-4"
                    >
                      Enter manually
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="border-t-2 border-[#172033] bg-[#ffcc4d] px-6 py-8 text-[#172033] sm:px-10 lg:border-l-2 lg:border-t-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#172033]">
                Your pipeline
              </p>
              <div className="mt-6 grid grid-cols-2 border-y-2 border-[#172033]">
                <div className="py-5 pr-5">
                  <p className="text-5xl font-black tracking-tight text-[#172033]">{jobs.length}</p>
                  <p className="mt-1 text-xs font-bold text-[#505667]">Tracked roles</p>
                </div>
                <div className="border-l-2 border-[#172033] py-5 pl-5">
                  <p className="text-5xl font-black tracking-tight text-[#c84736]">
                    {jobs.filter((job) => job.status === "Interviewing").length}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#505667]">Interviews</p>
                </div>
              </div>
              <p className="mt-5 text-sm font-medium leading-6 text-[#404658]">
                ATS scoring and tailored PDF actions become available after a
                Master CV is connected in the next workflow.
              </p>
            </div>
          </div>
        </section>

        {successMessage ? (
          <div
            role="status"
            className="mt-5 rounded-md border-2 border-[#315f3d] bg-[#dff0e3] px-4 py-3 text-sm font-bold text-[#244a2d]"
          >
            {successMessage}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between rounded-md border-2 border-[#172033] bg-white px-4 py-3 shadow-[4px_4px_0_#172033] sm:hidden">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {masterCv ? "Master CV ready" : "Master CV required"}
            </p>
            <p className="text-xs text-slate-500">
              Required for ATS scoring and tailored PDFs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMasterCvEditor((visible) => !visible)}
            className="rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-3 py-2 text-xs font-bold text-[#172033]"
          >
            {showMasterCvEditor ? "Close" : "Open"}
          </button>
        </div>

        {showMasterCvEditor ? (
          <MasterCvEditor
            userId={userId}
            apiBaseUrl={API_BASE_URL}
            initialMasterCv={masterCv}
            onSaved={(savedMasterCv) => {
              setMasterCv(savedMasterCv);
              setShowMasterCvEditor(false);
              setSuccessMessage("Master CV saved. ATS tailoring is ready.");
            }}
            onClose={() => setShowMasterCvEditor(false)}
          />
        ) : null}

        {review ? (
          <section className="mt-6 rounded-lg border-2 border-[#172033] bg-white p-5 shadow-[5px_5px_0_#172033] sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3157d5]">
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
                    className="h-11 rounded-md border-2 border-[#9ca1ad] px-3 font-normal text-[#172033] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dbe3ff]"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Company
                  <input
                    required
                    maxLength={200}
                    value={review.company}
                    onChange={(event) => updateReview("company", event.target.value)}
                    className="h-11 rounded-md border-2 border-[#9ca1ad] px-3 font-normal text-[#172033] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dbe3ff]"
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
                  className="h-11 rounded-md border-2 border-[#9ca1ad] px-3 font-normal text-[#172033] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dbe3ff]"
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
                  className="resize-y rounded-md border-2 border-[#9ca1ad] px-3 py-3 font-normal leading-6 text-[#172033] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dbe3ff]"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center rounded-md border-2 border-[#172033] bg-[#ff7058] px-6 text-sm font-black text-[#172033] shadow-[3px_3px_0_#172033] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#172033] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3157d5] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Add to application board"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-4xl font-black tracking-[-0.03em] text-[#172033]">
                Applications
              </h2>
              <p className="mt-1 text-sm font-medium text-[#626979]">
                Drag cards between stages as your applications progress.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadJobs()}
              disabled={isLoadingJobs}
              className="self-start rounded-md border-2 border-[#172033] bg-white px-4 py-2 text-sm font-bold text-[#172033] shadow-[3px_3px_0_#172033] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#172033] disabled:cursor-wait disabled:opacity-60"
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
              onGenerateTailoredCv={handleTailorCv}
            />
          )}
        </section>
      </main>
    </div>
  );
}
