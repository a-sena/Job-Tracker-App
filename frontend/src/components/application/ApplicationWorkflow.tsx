import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../../lib/apiClient";

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
  originalReviewDetails: CvReviewDetails | null;
  tailoredAtsScore: number | null;
  tailoredMatchedKeywords: string[];
  tailoredMissingKeywords: string[];
  tailoredPdfFileName: string | null;
  coverLetter: CoverLetter | null;
  coverLetterPdfFileName: string | null;
  interviewQuestions: string[];
  interviewAnswers: string[];
  interviewQuestionsPdfFileName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CvScoreComponent {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  explanation: string;
}

interface CvKeywordEvidence {
  keyword: string;
  section: string;
  evidenceText: string;
}

interface CvSectionFeedback {
  section: string;
  status: "strong" | "needs_attention" | "not_available";
  findings: string[];
  recommendations: string[];
}

interface CvReviewDetails {
  scoreBreakdown: CvScoreComponent[];
  keywordEvidence: CvKeywordEvidence[];
  strengths: string[];
  priorityActions: string[];
  sectionFeedback: CvSectionFeedback[];
  requirements: CvRequirement[];
  confidence: "high" | "medium" | "low";
  confidenceExplanation: string;
}

interface CvRequirement {
  keyword: string;
  category: "required" | "preferred" | "general";
  status: "matched" | "unsupported";
  section: string | null;
  evidenceText: string | null;
}

interface CoverLetter {
  language: string;
  subject: string;
  paragraphs: string[];
  evidence: Array<{ claim: string; evidenceText: string }>;
}

interface ApplicationCategory {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

interface ComparisonExperience {
  company: string;
  jobTitle: string;
  bulletPoints: string[];
}

interface ComparisonProject {
  name: string;
  bulletPoints: string[];
}

interface ComparisonCv {
  professionalSummary: string;
  workExperience: ComparisonExperience[];
  projects: ComparisonProject[];
}

interface TailoredCvComparison {
  draftId: string;
  original: ComparisonCv;
  tailored: ComparisonCv;
  changes: TailoredCvChange[];
}

interface TailoredCvChange {
  id: string;
  section: string;
  label: string;
  originalText: string;
  tailoredText: string;
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
  | "comparison"
  | "approval"
  | "coverLetter"
  | "questions"
  | "answers"
  | "log"
  | null;

const EMPTY_DRAFT_ARRAYS = {
  originalMatchedKeywords: [] as string[],
  originalMissingKeywords: [] as string[],
  tailoredMatchedKeywords: [] as string[],
  tailoredMissingKeywords: [] as string[],
  interviewQuestions: [] as string[],
  interviewAnswers: [] as string[],
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
  const response = await apiFetch(apiBaseUrl, path, {
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
  const reviewDetails = draft.originalReviewDetails
    ? {
        ...draft.originalReviewDetails,
        scoreBreakdown: draft.originalReviewDetails.scoreBreakdown ?? [],
        keywordEvidence: draft.originalReviewDetails.keywordEvidence ?? [],
        strengths: draft.originalReviewDetails.strengths ?? [],
        priorityActions: draft.originalReviewDetails.priorityActions ?? [],
        sectionFeedback: draft.originalReviewDetails.sectionFeedback ?? [],
        requirements: draft.originalReviewDetails.requirements ?? [],
        confidence: draft.originalReviewDetails.confidence ?? "low",
        confidenceExplanation:
          draft.originalReviewDetails.confidenceExplanation ??
          "Run the CV review again to calculate confidence for this analysis.",
      }
    : null;
  return {
    ...draft,
    ...EMPTY_DRAFT_ARRAYS,
    jobUrl: draft.jobUrl ?? "",
    title: draft.title ?? "",
    company: draft.company ?? "",
    description: draft.description ?? "",
    originalReviewDetails: reviewDetails,
    coverLetter: draft.coverLetter ?? null,
    originalMatchedKeywords: draft.originalMatchedKeywords ?? [],
    originalMissingKeywords: draft.originalMissingKeywords ?? [],
    tailoredMatchedKeywords: draft.tailoredMatchedKeywords ?? [],
    tailoredMissingKeywords: draft.tailoredMissingKeywords ?? [],
    interviewQuestions: draft.interviewQuestions ?? [],
    interviewAnswers: (draft.interviewQuestions ?? []).map(
      (_, index) => draft.interviewAnswers?.[index] ?? "",
    ),
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

function sameKeywordSet(first: string[], second: string[]): boolean {
  const normalizedFirst = new Set(first.map((value) => value.trim().toLocaleLowerCase()));
  const normalizedSecond = new Set(second.map((value) => value.trim().toLocaleLowerCase()));
  return (
    normalizedFirst.size === normalizedSecond.size &&
    [...normalizedFirst].every((value) => normalizedSecond.has(value))
  );
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
  const [showReviewDetails, setShowReviewDetails] = useState(false);
  const [showTailoringComparison, setShowTailoringComparison] = useState(false);
  const [tailoringComparison, setTailoringComparison] =
    useState<TailoredCvComparison | null>(null);
  const [acceptedChangeIds, setAcceptedChangeIds] = useState<Set<string>>(new Set());
  const [showCoverLetter, setShowCoverLetter] = useState(false);
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
  const reviewedRequirementCount =
    (draft?.originalMatchedKeywords.length ?? 0) +
    (draft?.originalMissingKeywords.length ?? 0);
  const hasFixedComparisonBasis = Boolean(
    draft &&
      hasTailoredCv &&
      sameKeywordSet(
        draft.originalMatchedKeywords,
        draft.tailoredMatchedKeywords,
      ) &&
      sameKeywordSet(
        draft.originalMissingKeywords,
        draft.tailoredMissingKeywords,
      ),
  );

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

  async function openTailoringComparison(): Promise<void> {
    if (!draft) return;
    setBusy("comparison");
    setError(null);
    try {
      const comparison = await request<TailoredCvComparison>(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/tailored-cv/comparison`,
      );
      setTailoringComparison(comparison);
      setAcceptedChangeIds(new Set(comparison.changes.map((change) => change.id)));
      setShowTailoringComparison(true);
    } catch (comparisonError) {
      setError(
        comparisonError instanceof Error
          ? comparisonError.message
          : "The CV changes could not be loaded.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function approveTailoredChanges(): Promise<void> {
    if (!draft || !tailoringComparison) return;
    setBusy("approval");
    setError(null);
    try {
      const updated = await request<ApplicationDraft>(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/tailored-cv/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acceptedChangeIds: [...acceptedChangeIds] }),
        },
      );
      setDraft(normalizeDraft(updated));
      setTailoringComparison(null);
      setShowTailoringComparison(false);
      setNotice(
        `${acceptedChangeIds.size} of ${tailoringComparison.changes.length} CV changes applied.`,
      );
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "The selected CV changes could not be applied.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function generateCoverLetter(): Promise<void> {
    if (!draft) return;
    setBusy("coverLetter");
    setError(null);
    try {
      const updated = await request<ApplicationDraft>(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/cover-letter`,
        { method: "POST" },
      );
      const normalized = normalizeDraft(updated);
      setDraft(normalized);
      setShowCoverLetter(true);
      setNotice("Your factual, vacancy-specific cover letter is ready.");
    } catch (coverLetterError) {
      setError(
        coverLetterError instanceof Error
          ? coverLetterError.message
          : "The cover letter could not be generated.",
      );
    } finally {
      setBusy(null);
    }
  }

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

  function updateInterviewAnswer(index: number, value: string): void {
    setDraft((current) => {
      if (!current) return current;
      const answers = current.interviewQuestions.map(
        (_, answerIndex) => answerIndex === index
          ? value
          : current.interviewAnswers[answerIndex] ?? "",
      );
      return { ...current, interviewAnswers: answers };
    });
  }

  async function saveInterviewAnswers(): Promise<void> {
    if (!draft || draft.interviewQuestions.length === 0) return;
    setBusy("answers");
    setError(null);
    try {
      const updated = await request<ApplicationDraft>(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/interview-answers`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: draft.interviewAnswers }),
        },
      );
      setDraft(normalizeDraft(updated));
      setNotice("Your interview answers were saved.");
    } catch (answerError) {
      setError(
        answerError instanceof Error
          ? answerError.message
          : "Your interview answers could not be saved.",
      );
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
              {draft.originalReviewDetails ? (
                <button
                  type="button"
                  onClick={() => setShowReviewDetails(true)}
                  className="w-full rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-xs font-black shadow-[2px_2px_0_#172033] hover:bg-[#eef2ff]"
                >
                  View detailed CV review
                </button>
              ) : (
                <p className="rounded-md border border-[#d2b36a] bg-[#fff7d9] p-2 text-[11px] leading-4 text-[#6d4e08]">
                  Run Review again to generate the new section-by-section analysis.
                </p>
              )}
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
              <p
                className={`rounded-md border px-2.5 py-2 text-[11px] leading-4 ${
                  hasFixedComparisonBasis
                    ? "border-[#9fb7a5] bg-[#edf7ef] text-[#315f3d]"
                    : "border-[#d2b36a] bg-[#fff7d9] text-[#6d4e08]"
                }`}
              >
                {hasFixedComparisonBasis
                  ? `Both scores use the same ${reviewedRequirementCount} reviewed requirements.`
                  : "This result uses an older scoring basis. Select Tailor again for a fair comparison."}
              </p>
              <KeywordList
                label="Still unsupported"
                keywords={draft.tailoredMissingKeywords}
                tone="missing"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void openTailoringComparison()}
                  disabled={busy === "comparison"}
                  className="col-span-2 rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-2 py-2 text-center text-xs font-black disabled:opacity-60"
                >
                  {busy === "comparison" ? "Loading changes…" : "Review changes"}
                </button>
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
              <p className="mt-1 text-[10px] font-semibold text-[#52745a]">
                {draft.interviewAnswers.filter((answer) => answer.trim().length > 0).length} answers saved
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

      <section className="mt-5 rounded-lg border-2 border-[#172033] bg-[#f3f5ff] p-4 shadow-[4px_4px_0_#3157d5]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#3157d5]">
              Application document
            </p>
            <h2 className="mt-1 text-lg font-black text-[#172033]">
              Vacancy-specific cover letter
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#626979]">
              Generate a concise letter in the vacancy language. Every candidate
              claim must be supported by the selected CV.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {draft?.coverLetter ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowCoverLetter(true)}
                  className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-xs font-black"
                >
                  Preview letter
                </button>
                <a
                  href={apiUrl(
                    apiBaseUrl,
                    `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/cover-letter/pdf?download=true`,
                  )}
                  className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-xs font-black"
                >
                  Download PDF
                </a>
              </>
            ) : null}
            <button
              type="button"
              disabled={!hasSource || busy === "coverLetter"}
              onClick={() => void generateCoverLetter()}
              className="rounded-md border-2 border-[#172033] bg-[#3157d5] px-4 py-2 text-xs font-black text-white shadow-[2px_2px_0_#ffcc4d] disabled:cursor-not-allowed disabled:bg-[#a8abb3] disabled:shadow-none"
            >
              {busy === "coverLetter"
                ? "Writing…"
                : draft?.coverLetter
                  ? "Regenerate letter"
                  : "Create cover letter"}
            </button>
          </div>
        </div>
      </section>

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

      {showReviewDetails && draft?.originalReviewDetails ? (
        <Modal title="Detailed CV review" onClose={() => setShowReviewDetails(false)}>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#626979]">
                {draft.title} at {draft.company}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#626979]">
                Every match below is connected to factual information from your CV.
              </p>
            </div>
            <div className={`shrink-0 rounded-md border-2 px-4 py-2 ${scoreTone(draft.originalAtsScore ?? 0)}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.12em]">
                Total match
              </p>
              <p className="text-3xl font-black">
                {Math.round(draft.originalAtsScore ?? 0)}%
              </p>
            </div>
          </div>

          <section className="mt-5 rounded-md border-2 border-[#9ca1ad] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[#172033]">Review confidence</h3>
              <span className="rounded-full border border-[#3157d5] bg-[#eef2ff] px-2.5 py-1 text-[10px] font-black uppercase text-[#3157d5]">
                {draft.originalReviewDetails.confidence}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#626979]">
              {draft.originalReviewDetails.confidenceExplanation}
            </p>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#172033]">
              Vacancy requirements
            </h3>
            <div className="mt-3 overflow-hidden rounded-md border-2 border-[#c3c5ca] bg-white">
              {draft.originalReviewDetails.requirements.map((requirement) => (
                <article
                  key={`${requirement.category}-${requirement.keyword}`}
                  className="border-b border-[#deded9] p-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[#172033]">
                      {requirement.keyword}
                    </span>
                    <span className="rounded-full border border-[#9ca1ad] bg-[#f3f3ef] px-2 py-0.5 text-[9px] font-black uppercase text-[#626979]">
                      {requirement.category}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                        requirement.status === "matched"
                          ? "border-[#8eb69a] bg-[#edf7ef] text-[#315f3d]"
                          : "border-[#e8b4ab] bg-[#fff1ee] text-[#8b3d32]"
                      }`}
                    >
                      {requirement.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-[#626979]">
                    {requirement.evidenceText
                      ? `${requirement.section}: “${requirement.evidenceText}”`
                      : "No factual evidence was found in the uploaded CV, so this requirement remains unsupported."}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#172033]">
              Score breakdown
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {draft.originalReviewDetails.scoreBreakdown.map((component) => {
                const percentage = Math.min(
                  100,
                  Math.max(0, (component.score / component.maxScore) * 100),
                );
                return (
                  <article
                    key={component.key}
                    className="rounded-md border-2 border-[#c3c5ca] bg-white p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h4 className="text-sm font-black">{component.label}</h4>
                      <p className="shrink-0 text-sm font-black text-[#3157d5]">
                        {Math.round(component.score * 10) / 10}/{component.maxScore}
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#deded9]">
                      <div
                        className="h-full rounded-full bg-[#3157d5]"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#626979]">
                      {component.explanation}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-md border-2 border-[#8eb69a] bg-[#edf7ef] p-4">
              <h3 className="text-sm font-black text-[#315f3d]">Verified strengths</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-[#315f3d]">
                {draft.originalReviewDetails.strengths.map((strength) => (
                  <li key={strength}>{strength}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-md border-2 border-[#d2b36a] bg-[#fff7d9] p-4">
              <h3 className="text-sm font-black text-[#6d4e08]">Priority actions</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-[#6d4e08]">
                {draft.originalReviewDetails.priorityActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
            </section>
          </div>

          <section className="mt-6">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#172033]">
              Evidence behind matched keywords
            </h3>
            {draft.originalReviewDetails.keywordEvidence.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {draft.originalReviewDetails.keywordEvidence.map((item) => (
                  <article
                    key={`${item.keyword}-${item.section}`}
                    className="rounded-md border border-[#c3c5ca] bg-white p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-[#8eb69a] bg-[#edf7ef] px-2 py-0.5 text-[11px] font-black text-[#315f3d]">
                        {item.keyword}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wide text-[#777b84]">
                        {item.section}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#4f5665]">
                      “{item.evidenceText}”
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-[#c3c5ca] bg-white p-3 text-xs text-[#626979]">
                No displayable evidence excerpts were returned for this review.
              </p>
            )}
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#172033]">
              Section-by-section feedback
            </h3>
            <div className="mt-3 grid gap-3">
              {draft.originalReviewDetails.sectionFeedback.map((section) => (
                <article
                  key={section.section}
                  className="rounded-md border-2 border-[#c3c5ca] bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-black">{section.section}</h4>
                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                        section.status === "strong"
                          ? "border-[#8eb69a] bg-[#edf7ef] text-[#315f3d]"
                          : section.status === "needs_attention"
                            ? "border-[#d2b36a] bg-[#fff7d9] text-[#6d4e08]"
                            : "border-[#b8bac0] bg-[#ececea] text-[#626979]"
                      }`}
                    >
                      {section.status.replace("_", " ")}
                    </span>
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-[#4f5665]">
                    {section.findings.map((finding) => (
                      <li key={finding}>{finding}</li>
                    ))}
                  </ul>
                  {section.recommendations.length > 0 ? (
                    <div className="mt-3 border-l-4 border-[#3157d5] bg-[#eef2ff] px-3 py-2 text-xs leading-5 text-[#33436d]">
                      {section.recommendations.map((recommendation) => (
                        <p key={recommendation}>{recommendation}</p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </Modal>
      ) : null}

      {showTailoringComparison && tailoringComparison ? (
        <Modal
          title="What the AI changed"
          onClose={() => setShowTailoringComparison(false)}
        >
          <p className="mt-2 text-sm leading-6 text-[#626979]">
            Facts, employers, projects, tools, and dates stay locked. Only the
            summary and existing evidence bullets may be rephrased.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-[#3157d5] bg-[#eef2ff] p-3">
            <p className="text-xs font-bold text-[#33436d]">
              {acceptedChangeIds.size} of {tailoringComparison.changes.length} changes selected
            </p>
            <div className="flex gap-3 text-xs font-black">
              <button
                type="button"
                onClick={() =>
                  setAcceptedChangeIds(
                    new Set(tailoringComparison.changes.map((change) => change.id)),
                  )
                }
                className="text-[#3157d5] underline underline-offset-2"
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={() => setAcceptedChangeIds(new Set())}
                className="text-[#8b3d32] underline underline-offset-2"
              >
                Reject all
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {tailoringComparison.changes.map((change) => {
              const accepted = acceptedChangeIds.has(change.id);
              return (
                <label
                  key={change.id}
                  className={`block cursor-pointer rounded-md border-2 p-4 ${
                    accepted
                      ? "border-[#3157d5] bg-[#f3f5ff]"
                      : "border-[#b8bac0] bg-white"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={() =>
                        setAcceptedChangeIds((current) => {
                          const next = new Set(current);
                          if (next.has(change.id)) next.delete(change.id);
                          else next.add(change.id);
                          return next;
                        })
                      }
                      className="mt-1 h-4 w-4 accent-[#3157d5]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-[#626979]">
                        {change.section} · {change.label}
                      </span>
                      <span className="mt-2 block rounded border border-[#e8b4ab] bg-[#fff1ee] p-2 text-xs leading-5 text-[#7f3026] line-through decoration-[#a54538]">
                        {change.originalText}
                      </span>
                      <span className="mt-2 block rounded border border-[#8eb69a] bg-[#edf7ef] p-2 text-xs leading-5 text-[#315f3d]">
                        {change.tailoredText}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <section className="rounded-md border-2 border-[#b8bac0] bg-white p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#626979]">
                Original summary
              </h3>
              <p className="mt-2 text-sm leading-6">
                {tailoringComparison.original.professionalSummary}
              </p>
            </section>
            <section className="rounded-md border-2 border-[#3157d5] bg-[#f3f5ff] p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#3157d5]">
                Tailored summary
              </h3>
              <p className="mt-2 text-sm leading-6">
                {tailoringComparison.tailored.professionalSummary}
              </p>
            </section>
          </div>

          {tailoringComparison.original.workExperience.map((experience, index) => {
            const tailored = tailoringComparison.tailored.workExperience[index];
            return (
              <section key={`${experience.company}-${index}`} className="mt-5">
                <h3 className="font-black text-[#172033]">
                  {experience.jobTitle} · {experience.company}
                </h3>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <ul className="list-disc space-y-2 rounded-md border border-[#cfcec9] bg-white p-4 pl-8 text-sm leading-6">
                    {experience.bulletPoints.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                  <ul className="list-disc space-y-2 rounded-md border border-[#aab8ee] bg-[#f3f5ff] p-4 pl-8 text-sm leading-6">
                    {(tailored?.bulletPoints ?? []).map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}

          {tailoringComparison.original.projects.map((project, index) => {
            const tailored = tailoringComparison.tailored.projects[index];
            return (
              <section key={`${project.name}-${index}`} className="mt-5">
                <h3 className="font-black text-[#172033]">{project.name}</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <ul className="list-disc space-y-2 rounded-md border border-[#cfcec9] bg-white p-4 pl-8 text-sm leading-6">
                    {project.bulletPoints.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                  <ul className="list-disc space-y-2 rounded-md border border-[#aab8ee] bg-[#f3f5ff] p-4 pl-8 text-sm leading-6">
                    {(tailored?.bulletPoints ?? []).map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
          <div className="sticky bottom-0 mt-6 border-t-2 border-[#172033] bg-[#f8f6f0] pt-4">
            <button
              type="button"
              disabled={busy === "approval"}
              onClick={() => void approveTailoredChanges()}
              className="w-full rounded-md border-2 border-[#172033] bg-[#3157d5] px-4 py-3 text-sm font-black text-white shadow-[3px_3px_0_#ffcc4d] disabled:opacity-60"
            >
              {busy === "approval"
                ? "Applying selection…"
                : `Apply ${acceptedChangeIds.size} selected changes`}
            </button>
          </div>
        </Modal>
      ) : null}

      {showCoverLetter && draft?.coverLetter ? (
        <Modal title="Cover letter preview" onClose={() => setShowCoverLetter(false)}>
          <div className="mt-4 rounded-md border-2 border-[#c3c5ca] bg-white p-5 sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#3157d5]">
              {draft.coverLetter.language}
            </p>
            <h3 className="mt-2 text-xl font-black text-[#172033]">
              {draft.coverLetter.subject}
            </h3>
            <p className="mt-1 text-xs font-bold text-[#626979]">
              {draft.title} · {draft.company}
            </p>
            <div className="mt-5 space-y-4 text-sm leading-7 text-[#303747]">
              {draft.coverLetter.paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph}`}>{paragraph}</p>
              ))}
            </div>
            <details className="mt-6 rounded-md border border-[#8eb69a] bg-[#edf7ef] p-3">
              <summary className="cursor-pointer text-xs font-black text-[#315f3d]">
                Verified CV evidence used ({draft.coverLetter.evidence?.length ?? 0})
              </summary>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-[#315f3d]">
                {(draft.coverLetter.evidence ?? []).map((item) => (
                  <li key={`${item.claim}-${item.evidenceText}`}>
                    <span className="font-black">{item.claim}:</span>{" "}
                    “{item.evidenceText}”
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={apiUrl(
                apiBaseUrl,
                `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/cover-letter/pdf?download=false`,
              )}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border-2 border-[#172033] bg-white px-4 py-2.5 text-sm font-black"
            >
              Open PDF
            </a>
            <a
              href={apiUrl(
                apiBaseUrl,
                `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/cover-letter/pdf?download=true`,
              )}
              className="rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-4 py-2.5 text-sm font-black shadow-[2px_2px_0_#172033]"
            >
              Download PDF
            </a>
          </div>
        </Modal>
      ) : null}

      {showQuestions && draft ? (
        <Modal title="First-round interview questions" onClose={() => setShowQuestions(false)}>
          <p className="mt-2 text-sm text-[#626979]">
            {draft.title} at {draft.company}
          </p>
          <ol className="mt-5 space-y-3">
            {draft.interviewQuestions.map((question, index) => (
              <li
                key={`${index}-${question}`}
                className="rounded-md border border-[#cfcec9] bg-white p-3"
              >
                <div className="flex gap-3 text-sm leading-6">
                  <span className="font-black text-[#3157d5]">{index + 1}.</span>
                  <span className="font-bold text-[#343b4d]">{question}</span>
                </div>
                <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#777b84]">
                  Your answer
                  <textarea
                    rows={4}
                    maxLength={5_000}
                    value={draft.interviewAnswers[index] ?? ""}
                    onChange={(event) => updateInterviewAnswer(index, event.target.value)}
                    placeholder="Write your own example, talking points, or a complete answer…"
                    className="mt-1.5 w-full resize-y rounded-md border-2 border-[#c5c7cd] bg-[#fbfaf7] px-3 py-2.5 text-sm font-medium normal-case leading-6 tracking-normal text-[#343b4d] outline-none transition focus:border-[#3157d5]"
                  />
                </label>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === "answers"}
              onClick={() => void saveInterviewAnswers()}
              className="rounded-md border-2 border-[#172033] bg-[#3157d5] px-4 py-2.5 text-sm font-black text-white shadow-[2px_2px_0_#172033] transition hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:cursor-wait disabled:opacity-60"
            >
              {busy === "answers" ? "Saving answers…" : "Save my answers"}
            </button>
            <a
              href={apiUrl(
                apiBaseUrl,
                `/api/application-workflow/draft/${encodeURIComponent(draft.id)}/interview-questions/pdf`,
              )}
              className="rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-4 py-2.5 text-sm font-black shadow-[2px_2px_0_#172033]"
            >
              Download questions as PDF
            </a>
          </div>
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
