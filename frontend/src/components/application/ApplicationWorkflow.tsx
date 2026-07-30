import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface SavedCv {
  id: string;
  userId: string;
  name: string;
  originalFileName: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDraft {
  id: string;
  userId: string;
  masterCvId: string | null;
  jobUrl: string | null;
  title: string | null;
  company: string | null;
  description: string | null;
  location: string | null;
  originalAtsScore: number | null;
  originalMatchedKeywords: string[];
  originalMissingKeywords: string[];
  originalAtsExplanation: string | null;
  tailoredAtsScore: number | null;
  tailoredMatchedKeywords: string[];
  tailoredMissingKeywords: string[];
  tailoredPdfFileName: string | null;
  interviewQuestions: string[];
  interviewQuestionsPdfFileName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApplicationCategory {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

interface ExtractedJob {
  jobUrl: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  warnings?: string[];
}

interface ProblemDetails {
  detail?: string;
  title?: string;
  errors?: Record<string, string[]>;
}

interface ApplicationWorkflowProps {
  userId: string;
  apiBaseUrl?: string;
  onApplicationLogged: () => void | Promise<void>;
}

type BusyAction =
  | "loading"
  | "upload"
  | "source"
  | "review"
  | "tailor"
  | "questions"
  | "log"
  | null;

const EMPTY_DRAFT_ARRAYS = {
  originalMatchedKeywords: [] as string[],
  originalMissingKeywords: [] as string[],
  tailoredMatchedKeywords: [] as string[],
  tailoredMissingKeywords: [] as string[],
  interviewQuestions: [] as string[],
};

function apiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as ProblemDetails;
    const validationMessages = Object.values(problem.errors ?? {})
      .flat()
      .filter(Boolean);
    if (validationMessages.length > 0) {
      return validationMessages.join(" ");
    }
    return problem.detail || problem.title || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

async function request<T>(
  apiBaseUrl: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(apiBaseUrl, path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeDraft(draft: ApplicationDraft): ApplicationDraft {
  return {
    ...draft,
    ...EMPTY_DRAFT_ARRAYS,
    jobUrl: draft.jobUrl ?? "",
    title: draft.title ?? "",
    company: draft.company ?? "",
    description: draft.description ?? "",
    originalMatchedKeywords: draft.originalMatchedKeywords ?? [],
    originalMissingKeywords: draft.originalMissingKeywords ?? [],
    tailoredMatchedKeywords: draft.tailoredMatchedKeywords ?? [],
    tailoredMissingKeywords: draft.tailoredMissingKeywords ?? [],
    interviewQuestions: draft.interviewQuestions ?? [],
  };
}

function scoreTone(score: number): string {
  if (score > 75) {
    return "border-[#315f3d] bg-[#dff0e3] text-[#244a2d]";
  }
  if (score >= 50) {
    return "border-[#8a6514] bg-[#fff1bd] text-[#6d4e08]";
  }
  return "border-[#a54538] bg-[#ffe1dc] text-[#7f3026]";
}

function Score({
  label,
  value,
}: {
  label: string;
  value: number;
}): JSX.Element {
  return (
    <div className={`rounded-md border-2 p-3 ${scoreTone(value)}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight">
        {Math.round(value)}
        <span className="text-sm">%</span>
      </p>
    </div>
  );
}

function KeywordList({
  label,
  keywords,
  tone,
}: {
  label: string;
  keywords: string[];
  tone: "matched" | "missing";
}): JSX.Element | null {
  if (keywords.length === 0) {
    return null;
  }

  const classes =
    tone === "matched"
      ? "border-[#8eb69a] bg-[#edf7ef] text-[#315f3d]"
      : "border-[#e8b4ab] bg-[#fff1ee] text-[#8b3d32]";

  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#626979]">
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {keywords.slice(0, 8).map((keyword) => (
          <li
            key={keyword}
            className={`rounded border px-2 py-1 text-[11px] font-bold ${classes}`}
          >
            {keyword}
          </li>
        ))}
      </ul>
      {keywords.length > 8 ? (
        <p className="mt-1.5 text-[11px] text-[#626979]">
          +{keywords.length - 8} more
        </p>
      ) : null}
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  state,
  optional = false,
  children,
}: {
  number: number;
  title: string;
  description: string;
  state: "active" | "complete" | "future";
  optional?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const stateClasses = {
    active: "border-[#3157d5] bg-white shadow-[5px_5px_0_#ffcc4d]",
    complete: "border-[#547160] bg-[#f4f8f4]",
    future: "border-[#b8bac0] bg-[#e6e4df] text-[#6f7480]",
  }[state];

  const badgeClasses = {
    active: "border-[#172033] bg-[#3157d5] text-white",
    complete: "border-[#315f3d] bg-[#315f3d] text-white",
    future: "border-[#9da0a8] bg-[#d2d0cb] text-[#62666f]",
  }[state];

  return (
    <article
      className={`flex min-w-0 flex-col rounded-lg border-2 p-4 transition-colors ${stateClasses}`}
      aria-current={state === "active" ? "step" : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 text-xs font-black ${badgeClasses}`}
        >
          {state === "complete" ? "✓" : number}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black leading-5 text-[#172033]">{title}</h3>
            {optional ? (
              <span className="rounded-full border border-current px-2 py-0.5 text-[9px] font-black uppercase tracking-wide opacity-70">
                Optional
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </article>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/65 p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-modal-title"
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border-2 border-[#172033] bg-[#f8f6f0] p-5 shadow-[8px_8px_0_#172033] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="workflow-modal-title"
            className="text-2xl font-black tracking-tight text-[#172033]"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-[#172033] bg-white text-lg font-black hover:bg-[#ffcc4d]"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function ApplicationWorkflow({
  userId,
  apiBaseUrl = "",
  onApplicationLogged,
}: ApplicationWorkflowProps): JSX.Element {
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [savedCvs, setSavedCvs] = useState<SavedCv[]>([]);
  const [selectedCvId, setSelectedCvId] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [vacancyDetails, setVacancyDetails] = useState<ExtractedJob | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<BusyAction>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [categories, setCategories] = useState<ApplicationCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const loadInitialData = useCallback(async () => {
    setBusy("loading");
    setError(null);
    try {
      const cvs = await request<SavedCv[]>(
        apiBaseUrl,
        `/api/cvs?userId=${encodeURIComponent(userId)}`,
      );
      setSavedCvs(cvs);

      const loadedDraft = await request<ApplicationDraft>(
        apiBaseUrl,
        "/api/application-workflow/draft",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );

      const normalizedDraft = normalizeDraft(loadedDraft);
      setDraft(normalizedDraft);
      setJobUrl(normalizedDraft.jobUrl ?? "");
      setSelectedCvId(
        normalizedDraft.masterCvId ??
          cvs.find((cv) => cv.isDefault)?.id ??
          cvs[0]?.id ??
          "",
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The application workspace could not be loaded.",
      );
    } finally {
      setBusy(null);
    }
  }, [apiBaseUrl, userId]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const hasSource = Boolean(
    draft?.masterCvId &&
      draft.jobUrl &&
      draft.title &&
      draft.company &&
      draft.description,
  );
  const hasReview = draft?.originalAtsScore != null;
  const hasTailoredCv = draft?.tailoredAtsScore != null;
  const hasQuestions = (draft?.interviewQuestions.length ?? 0) > 0;

  const activeStep = !hasSource ? 1 : !hasReview ? 2 : !hasTailoredCv ? 3 : 4;
  const cardState = (step: number): "active" | "complete" | "future" => {
    const complete = [hasSource, hasReview, hasTailoredCv, hasQuestions][step - 1];
    if (complete) {
      return "complete";
    }
    return step === activeStep ? "active" : "future";
  };

  const selectedCv = useMemo(
    () => savedCvs.find((cv) => cv.id === selectedCvId),
    [savedCvs, selectedCvId],
  );

  async function uploadCv() {
    if (!uploadFile || !uploadName.trim()) {
      setError("Choose a PDF and give the CV a clear name.");
      return;
    }
    if (uploadName.trim().length > 150) {
      setError("The CV name must be 150 characters or fewer.");
      return;
    }
    if (
      uploadFile.type !== "application/pdf" &&
      !uploadFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Only PDF files can be added to the saved CV library.");
      return;
    }
    if (uploadFile.size > 8_000_000) {
      setError("The PDF must be smaller than 8 MB.");
      return;
    }

    setBusy("upload");
    setError(null);
    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("name", uploadName.trim());
    formData.append("file", uploadFile);

    try {
      const cv = await request<SavedCv>(apiBaseUrl, "/api/cvs/import-pdf", {
        method: "POST",
        body: formData,
      });
      setSavedCvs((current) => [cv, ...current]);
      setSelectedCvId(cv.id);
      setUploadFile(null);
      setUploadName("");
      setShowUpload(false);
      setNotice(`${cv.name} is saved and selected.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "The CV could not be uploaded.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteCv(cv: SavedCv) {
    if (!window.confirm(`Delete "${cv.name}" from your saved CVs?`)) {
      return;
    }
    setError(null);
    try {
      await request<void>(apiBaseUrl, `/api/cvs/${encodeURIComponent(cv.id)}`, {
        method: "DELETE",
      });
      setSavedCvs((current) => current.filter((item) => item.id !== cv.id));
      if (selectedCvId === cv.id) {
        const replacement = savedCvs.find((item) => item.id !== cv.id);
        setSelectedCvId(replacement?.id ?? "");
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The CV could not be deleted.");
    }
  }

  async function makeDefault(cv: SavedCv) {
    setError(null);
    try {
      const updated = await request<SavedCv>(
        apiBaseUrl,
        `/api/cvs/${encodeURIComponent(cv.id)}/default`,
        { method: "PUT" },
      );
      setSavedCvs((current) =>
        current.map((item) => ({
          ...item,
          isDefault: item.id === updated.id,
        })),
      );
      setSelectedCvId(updated.id);
    } catch (defaultError) {
      setError(
        defaultError instanceof Error
          ? defaultError.message
          : "The default CV could not be changed.",
      );
    }
  }

  async function renameCv(cv: SavedCv) {
    const name = window.prompt("Rename saved CV", cv.name)?.trim();
    if (!name || name === cv.name) {
      return;
    }
    if (name.length > 150) {
      setError("The CV name must be 150 characters or fewer.");
      return;
    }
    setError(null);
    try {
      const updated = await request<SavedCv>(
        apiBaseUrl,
        `/api/cvs/${encodeURIComponent(cv.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setSavedCvs((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (renameError) {
      setError(
        renameError instanceof Error ? renameError.message : "The CV could not be renamed.",
      );
    }
  }

  async function prepareSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !selectedCvId) {
      setError("Select or upload a CV before continuing.");
      return;
    }

    let normalizedUrl: string;
    try {
      const parsed = new URL(jobUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
      normalizedUrl = parsed.toString();
    } catch {
      setError("Enter a complete HTTP or HTTPS job-posting URL.");
      return;
    }

    setBusy("source");
    setError(null);
    try {
      let source = vacancyDetails;
      if (!source) {
        const extracted = await request<ExtractedJob>(
          apiBaseUrl,
          "/api/jobs/extract",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobUrl: normalizedUrl }),
          },
        );
        source = {
          ...extracted,
          jobUrl: normalizedUrl,
          title: extracted.title.trim().slice(0, 300),
          company: extracted.company.trim().slice(0, 200),
          description: extracted.description.trim().slice(0, 50_000),
          location: extracted.location?.trim().slice(0, 200) || null,
        };
        setVacancyDetails(source);
      }

      const missingFields = [
        !source.title.trim() ? "job title" : null,
        !source.company.trim() ? "company" : null,
        source.description.trim().length < 20 ? "job description" : null,
      ].filter((field): field is string => field !== null);
      if (missingFields.length > 0) {
        setError(
          `We could not extract the ${missingFields.join(
            ", ",
          )}. Complete the vacancy details below, then try again.`,
        );
        return;
      }

      const updated = await request<ApplicationDraft>(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/source`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterCvId: selectedCvId,
            jobUrl: normalizedUrl,
            title: source.title.trim(),
            company: source.company.trim(),
            description: source.description.trim(),
            location: source.location?.trim() || null,
          }),
        },
      );
      setDraft(normalizeDraft(updated));
      setVacancyDetails(null);
      setNotice("CV and vacancy ready. Review the original match next.");
    } catch (sourceError) {
      setError(
        sourceError instanceof Error
          ? sourceError.message
          : "The vacancy could not be prepared.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function performDraftAction(
    action: Exclude<BusyAction, "loading" | "upload" | "source" | "log" | null>,
    endpoint: string,
    fallbackError: string,
  ) {
    if (!draft) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const updated = await request<ApplicationDraft>(apiBaseUrl, endpoint, {
        method: "POST",
      });
      setDraft(normalizeDraft(updated));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallbackError);
    } finally {
      setBusy(null);
    }
  }

  async function openCategoryDialog() {
    setError(null);
    try {
      const loaded = await request<ApplicationCategory[]>(
        apiBaseUrl,
        `/api/application-categories?userId=${encodeURIComponent(userId)}`,
      );
      setCategories(loaded);
      setSelectedCategoryId("");
      setNewCategoryName("");
      setShowCategories(true);
    } catch (categoryError) {
      setError(
        categoryError instanceof Error
          ? categoryError.message
          : "Categories could not be loaded.",
      );
    }
  }

  async function logApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) {
      return;
    }
    setBusy("log");
    setError(null);
    try {
      await request<unknown>(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/log`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: newCategoryName.trim() ? null : selectedCategoryId || null,
            newCategoryName: newCategoryName.trim() || null,
          }),
        },
      );
      setShowCategories(false);
      setNotice(`${draft.title} was added to the application log.`);
      await onApplicationLogged();
      await loadInitialData();
    } catch (logError) {
      setError(
        logError instanceof Error ? logError.message : "The application could not be logged.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (busy === "loading" && !draft) {
    return (
      <section aria-label="Application workflow" className="rounded-lg border-2 border-[#172033] bg-white p-6">
        <p className="animate-pulse text-sm font-bold text-[#626979]">
          Restoring your application draft…
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="workflow-heading">
      <div className="mb-5 max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3157d5]">
          Application studio
        </p>
        <h1
          id="workflow-heading"
          className="mt-2 text-4xl font-black tracking-[-0.035em] text-[#172033] sm:text-5xl"
        >
          Prepare one strong application.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#626979]">
          Move from vacancy to interview preparation. Your progress is saved
          automatically, and AI only rephrases experience already present in your CV.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border-2 border-[#a54538] bg-[#ffe1dc] px-4 py-3 text-sm font-bold text-[#7f3026]"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mb-4 rounded-md border-2 border-[#315f3d] bg-[#dff0e3] px-4 py-3 text-sm font-bold text-[#244a2d]"
        >
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StepCard
          number={1}
          title="Add your sources"
          description="Choose a saved CV and import the vacancy."
          state={cardState(1)}
        >
          <form onSubmit={prepareSource} className="flex flex-1 flex-col gap-3">
            <label className="text-xs font-black text-[#404658]">
              Saved CV library
              <select
                value={selectedCvId}
                onChange={(event) => setSelectedCvId(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border-2 border-[#9ca1ad] bg-white px-2 text-xs font-semibold text-[#172033] outline-none focus:border-[#3157d5]"
              >
                <option value="">Select a CV</option>
                {savedCvs.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.name}{cv.isDefault ? " — default" : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedCv ? (
              <div className="rounded-md border border-[#c8c8c5] bg-white p-2.5 text-[11px]">
                <p className="truncate font-bold text-[#172033]">{selectedCv.name}</p>
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void renameCv(selectedCv)}
                    className="font-bold text-[#3157d5] underline underline-offset-2"
                  >
                    Rename
                  </button>
                  {!selectedCv.isDefault ? (
                    <button
                      type="button"
                      onClick={() => void makeDefault(selectedCv)}
                      className="font-bold text-[#3157d5] underline underline-offset-2"
                    >
                      Make default
                    </button>
                  ) : (
                    <span className="font-bold text-[#315f3d]">Default CV</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteCv(selectedCv)}
                    className="font-bold text-[#a54538] underline underline-offset-2"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowUpload((current) => !current)}
              className="text-left text-xs font-black text-[#3157d5] underline decoration-2 underline-offset-4"
            >
              {showUpload
                ? "Cancel upload"
                : savedCvs.length > 0
                  ? "+ Add another CV"
                  : "+ Upload your first CV"}
            </button>

            {showUpload ? (
              <div className="rounded-md border-2 border-dashed border-[#8d92a0] bg-white p-3">
                <p className="mb-3 text-[11px] leading-4 text-[#626979]">
                  Keep separate CVs for different job types, such as IT, retail,
                  or childcare. The CV you upload here will be saved in your library.
                </p>
                <label className="block text-[11px] font-bold">
                  CV name
                  <input
                    value={uploadName}
                    maxLength={150}
                    onChange={(event) => setUploadName(event.target.value)}
                    placeholder="e.g. Product CV"
                    className="mt-1 h-9 w-full rounded border border-[#9ca1ad] px-2 text-xs outline-none focus:border-[#3157d5]"
                  />
                </label>
                <label className="mt-2 block text-[11px] font-bold">
                  PDF file
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setUploadFile(event.target.files?.[0] ?? null)
                    }
                    className="mt-1 block w-full text-[11px] file:mr-2 file:rounded file:border file:border-[#172033] file:bg-[#ffcc4d] file:px-2 file:py-1 file:text-[10px] file:font-black"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy === "upload"}
                  onClick={() => void uploadCv()}
                  className="mt-2 w-full rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-3 py-2 text-xs font-black disabled:opacity-60"
                >
                  {busy === "upload" ? "Uploading…" : "Save CV"}
                </button>
              </div>
            ) : null}

            <label className="text-xs font-black text-[#404658]">
              Vacancy URL
              <input
                type="url"
                required
                value={jobUrl}
                onChange={(event) => {
                  setJobUrl(event.target.value);
                  setVacancyDetails(null);
                }}
                placeholder="https://company.no/jobs/…"
                className="mt-1.5 h-10 w-full rounded-md border-2 border-[#9ca1ad] bg-white px-2.5 text-xs font-medium text-[#172033] outline-none focus:border-[#3157d5]"
              />
            </label>

            {vacancyDetails ? (
              <div className="space-y-2 rounded-md border-2 border-[#3157d5] bg-[#eef2ff] p-3">
                <p className="text-[11px] font-black text-[#172033]">
                  Review vacancy details
                </p>
                <p className="text-[10px] leading-4 text-[#626979]">
                  Correct anything the vacancy page did not expose clearly.
                </p>
                <label className="block text-[11px] font-bold">
                  Job title
                  <input
                    required
                    maxLength={300}
                    value={vacancyDetails.title}
                    onChange={(event) =>
                      setVacancyDetails((current) =>
                        current ? { ...current, title: event.target.value } : current,
                      )
                    }
                    className="mt-1 h-9 w-full rounded border border-[#9ca1ad] bg-white px-2 text-xs outline-none focus:border-[#3157d5]"
                  />
                </label>
                <label className="block text-[11px] font-bold">
                  Company
                  <input
                    required
                    maxLength={200}
                    value={vacancyDetails.company}
                    onChange={(event) =>
                      setVacancyDetails((current) =>
                        current ? { ...current, company: event.target.value } : current,
                      )
                    }
                    className="mt-1 h-9 w-full rounded border border-[#9ca1ad] bg-white px-2 text-xs outline-none focus:border-[#3157d5]"
                  />
                </label>
                <label className="block text-[11px] font-bold">
                  Location{" "}
                  <span className="font-medium text-[#777b84]">(optional)</span>
                  <input
                    maxLength={200}
                    value={vacancyDetails.location ?? ""}
                    onChange={(event) =>
                      setVacancyDetails((current) =>
                        current
                          ? { ...current, location: event.target.value || null }
                          : current,
                      )
                    }
                    className="mt-1 h-9 w-full rounded border border-[#9ca1ad] bg-white px-2 text-xs outline-none focus:border-[#3157d5]"
                  />
                </label>
                <label className="block text-[11px] font-bold">
                  Job description
                  <textarea
                    required
                    minLength={20}
                    maxLength={50_000}
                    value={vacancyDetails.description}
                    onChange={(event) =>
                      setVacancyDetails((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
                      )
                    }
                    rows={7}
                    className="mt-1 w-full resize-y rounded border border-[#9ca1ad] bg-white px-2 py-2 text-xs leading-5 outline-none focus:border-[#3157d5]"
                  />
                </label>
              </div>
            ) : null}

            {hasSource ? (
              <div className="rounded-md border border-[#9db4ef] bg-[#eef2ff] p-3">
                <p className="text-xs font-black text-[#172033]">{draft?.title}</p>
                <p className="mt-0.5 text-[11px] text-[#545d72]">
                  {draft?.company}
                  {draft?.location ? ` · ${draft.location}` : ""}
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!selectedCvId || busy === "source"}
              className="mt-auto rounded-md border-2 border-[#172033] bg-[#3157d5] px-3 py-2.5 text-xs font-black text-white shadow-[2px_2px_0_#172033] disabled:cursor-not-allowed disabled:bg-[#a8abb3] disabled:shadow-none"
            >
              {busy === "source"
                ? "Preparing vacancy…"
                : vacancyDetails
                  ? "Save vacancy details"
                  : hasSource
                    ? "Update sources"
                    : "Prepare application"}
            </button>
          </form>
        </StepCard>

        <StepCard
          number={2}
          title="Review CV match"
          description="See how your original CV fits the vacancy."
          state={cardState(2)}
          optional
        >
          {hasReview && draft ? (
            <div className="space-y-3">
              <Score label="Original ATS match" value={draft.originalAtsScore ?? 0} />
              <KeywordList
                label="Matched"
                keywords={draft.originalMatchedKeywords}
                tone="matched"
              />
              <KeywordList
                label="Missing"
                keywords={draft.originalMissingKeywords}
                tone="missing"
              />
              {draft.originalAtsExplanation ? (
                <p className="rounded-md bg-white p-2.5 text-[11px] leading-5 text-[#545b6b]">
                  {draft.originalAtsExplanation}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs leading-5">
              First, connect your CV to a vacancy. We’ll compare relevant skills and
              terminology without changing the document.
            </p>
          )}
          <button
            type="button"
            disabled={!hasSource || busy === "review"}
            onClick={() =>
              void performDraftAction(
                "review",
                `/api/application-workflow/draft/${encodeURIComponent(draft!.id)}/review`,
                "The CV review could not be completed.",
              )
            }
            className="mt-auto rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-3 py-2.5 text-xs font-black text-[#172033] shadow-[2px_2px_0_#172033] disabled:cursor-not-allowed disabled:border-[#9da0a8] disabled:bg-[#d2d0cb] disabled:text-[#777b84] disabled:shadow-none"
          >
            {busy === "review" ? "Reviewing…" : hasReview ? "Review again" : "Review CV"}
          </button>
        </StepCard>

        <StepCard
          number={3}
          title="Tailor with AI"
          description="Truthfully align phrasing and priorities."
          state={cardState(3)}
          optional
        >
          {hasTailoredCv && draft ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Score label="Before" value={draft.originalAtsScore ?? 0} />
                <Score label="Tailored" value={draft.tailoredAtsScore ?? 0} />
              </div>
              <p className="text-center text-xs font-black text-[#315f3d]">
                {Math.round((draft.tailoredAtsScore ?? 0) - (draft.originalAtsScore ?? 0)) >= 0
                  ? "+"
                  : ""}
                {Math.round((draft.tailoredAtsScore ?? 0) - (draft.originalAtsScore ?? 0))} points
              </p>
              <KeywordList
                label="Still unsupported"
                keywords={draft.tailoredMissingKeywords}
                tone="missing"
              />
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={apiUrl(
                    apiBaseUrl,
                    `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/tailored-cv/pdf?download=false`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border-2 border-[#172033] bg-white px-2 py-2 text-center text-xs font-black"
                >
                  Preview
                </a>
                <a
                  href={apiUrl(
                    apiBaseUrl,
                    `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/tailored-cv/pdf?download=true`,
                  )}
                  className="rounded-md border-2 border-[#172033] bg-white px-2 py-2 text-center text-xs font-black"
                >
                  Download PDF
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5">
              AI can rephrase and reorder only what your CV already supports. Missing
              qualifications remain clearly identified.
            </p>
          )}
          <button
            type="button"
            disabled={!hasReview || busy === "tailor"}
            onClick={() =>
              void performDraftAction(
                "tailor",
                `/api/application-workflow/draft/${encodeURIComponent(draft!.id)}/tailor`,
                "The tailored CV could not be generated.",
              )
            }
            className="mt-auto rounded-md border-2 border-[#172033] bg-[#ff7058] px-3 py-2.5 text-xs font-black text-[#172033] shadow-[2px_2px_0_#172033] disabled:cursor-not-allowed disabled:border-[#9da0a8] disabled:bg-[#d2d0cb] disabled:text-[#777b84] disabled:shadow-none"
          >
            {busy === "tailor" ? "Tailoring…" : hasTailoredCv ? "Tailor again" : "Tailor CV with AI"}
          </button>
        </StepCard>

        <StepCard
          number={4}
          title="Prepare for interview"
          description="Practise likely first-round questions."
          state={cardState(4)}
          optional
        >
          {hasQuestions && draft ? (
            <div className="rounded-md border-2 border-[#7da788] bg-[#edf7ef] p-3">
              <p className="text-3xl font-black text-[#315f3d]">
                {draft.interviewQuestions.length}
              </p>
              <p className="text-[11px] font-bold text-[#42634a]">
                first-round questions ready
              </p>
              <button
                type="button"
                onClick={() => setShowQuestions(true)}
                className="mt-3 w-full rounded-md border-2 border-[#172033] bg-white px-2 py-2 text-xs font-black"
              >
                View questions
              </button>
              <a
                href={apiUrl(
                  apiBaseUrl,
                  `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/interview-questions/pdf`,
                )}
                className="mt-2 block w-full rounded-md border-2 border-[#172033] bg-white px-2 py-2 text-center text-xs font-black"
              >
                Download PDF
              </a>
            </div>
          ) : (
            <p className="text-xs leading-5">
              Generate practical questions about your background, motivation, working
              style, and interest in this role—not deep technical tests.
            </p>
          )}
          <button
            type="button"
            disabled={!hasTailoredCv || busy === "questions"}
            onClick={() =>
              void performDraftAction(
                "questions",
                `/api/application-workflow/draft/${encodeURIComponent(draft!.id)}/interview-questions`,
                "Interview questions could not be generated.",
              )
            }
            className="mt-auto rounded-md border-2 border-[#172033] bg-[#42a568] px-3 py-2.5 text-xs font-black text-white shadow-[2px_2px_0_#172033] disabled:cursor-not-allowed disabled:border-[#9da0a8] disabled:bg-[#d2d0cb] disabled:text-[#777b84] disabled:shadow-none"
          >
            {busy === "questions"
              ? "Preparing…"
              : hasQuestions
                ? "Generate new questions"
                : "Create interview questions"}
          </button>
        </StepCard>
      </div>

      <div className="mt-5 flex flex-col items-start justify-between gap-3 rounded-lg border-2 border-[#172033] bg-white p-4 shadow-[4px_4px_0_#172033] sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-black text-[#172033]">Ready to track this role?</p>
          <p className="mt-0.5 text-xs text-[#626979]">
            ATS review, CV tailoring, and interview questions are optional. Once your
            sources are ready, choose a category and add the role to your log.
          </p>
        </div>
        <button
          type="button"
          disabled={!hasSource}
          onClick={() => void openCategoryDialog()}
          className="rounded-md border-2 border-[#172033] bg-[#3157d5] px-5 py-2.5 text-sm font-black text-white shadow-[3px_3px_0_#ffcc4d] disabled:cursor-not-allowed disabled:bg-[#a8abb3] disabled:shadow-none"
        >
          Add application to log
        </button>
      </div>

      {showQuestions && draft ? (
        <Modal title="First-round interview questions" onClose={() => setShowQuestions(false)}>
          <p className="mt-2 text-sm text-[#626979]">
            {draft.title} at {draft.company}
          </p>
          <ol className="mt-5 space-y-3">
            {draft.interviewQuestions.map((question, index) => (
              <li
                key={`${index}-${question}`}
                className="flex gap-3 rounded-md border border-[#cfcec9] bg-white p-3 text-sm leading-6"
              >
                <span className="font-black text-[#3157d5]">{index + 1}.</span>
                <span>{question}</span>
              </li>
            ))}
          </ol>
          <a
            href={apiUrl(
              apiBaseUrl,
              `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/interview-questions/pdf`,
            )}
            className="mt-5 inline-block rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-4 py-2.5 text-sm font-black shadow-[2px_2px_0_#172033]"
          >
            Download questions as PDF
          </a>
        </Modal>
      ) : null}

      {showCategories ? (
        <Modal title="Add to application log" onClose={() => setShowCategories(false)}>
          <form onSubmit={logApplication} className="mt-5">
            <fieldset>
              <legend className="text-sm font-black text-[#172033]">Choose a category</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-[#b8bac0] bg-white p-3 text-sm font-bold has-[:checked]:border-[#3157d5] has-[:checked]:bg-[#eef2ff]">
                  <input
                    type="radio"
                    name="category"
                    value=""
                    checked={!selectedCategoryId && !newCategoryName}
                    onChange={() => {
                      setSelectedCategoryId("");
                      setNewCategoryName("");
                    }}
                  />
                  Uncategorized
                </label>
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-[#b8bac0] bg-white p-3 text-sm font-bold has-[:checked]:border-[#3157d5] has-[:checked]:bg-[#eef2ff]"
                  >
                    <input
                      type="radio"
                      name="category"
                      value={category.id}
                      checked={selectedCategoryId === category.id && !newCategoryName}
                      onChange={() => {
                        setSelectedCategoryId(category.id);
                        setNewCategoryName("");
                      }}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-5 block text-sm font-black">
              Or create a new category
              <input
                value={newCategoryName}
                maxLength={100}
                onChange={(event) => {
                  setNewCategoryName(event.target.value);
                  if (event.target.value) {
                    setSelectedCategoryId("");
                  }
                }}
                placeholder="e.g. Product roles"
                className="mt-2 h-11 w-full rounded-md border-2 border-[#9ca1ad] bg-white px-3 text-sm font-medium outline-none focus:border-[#3157d5]"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCategories(false)}
                className="rounded-md border-2 border-[#172033] bg-white px-4 py-2.5 text-sm font-black"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === "log"}
                className="rounded-md border-2 border-[#172033] bg-[#3157d5] px-4 py-2.5 text-sm font-black text-white shadow-[2px_2px_0_#172033] disabled:opacity-60"
              >
                {busy === "log" ? "Adding…" : "Add to log"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
