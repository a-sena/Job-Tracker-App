import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { format, isValid, parseISO } from "date-fns";
import { nb } from "date-fns/locale";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/apiClient";

export const JOB_STATUSES = [
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type WorkArrangement = "Unspecified" | "OnSite" | "Hybrid" | "Remote";

interface EditableJobDetails {
  location: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterLinkedInUrl: string;
  salaryRange: string;
  workArrangement: WorkArrangement;
  personalNotes: string;
}

export interface JobApplication {
  id: string;
  title: string;
  company: string;
  jobUrl: string;
  description: string;
  location: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterLinkedInUrl: string | null;
  salaryRange: string | null;
  workArrangement: WorkArrangement;
  personalNotes: string | null;
  categoryName: string | null;
  appliedDate: string;
  atsMatchScore: number | null;
  missingKeywords: string[];
  tailoredPdfUrl?: string | null;
  status: JobStatus;
}

interface CvRequirement {
  keyword: string;
  category: "required" | "preferred" | "general";
  status: "matched" | "unsupported";
  section: string | null;
  evidenceText: string | null;
}

interface LoggedApplicationPackage {
  id: string;
  masterCvId: string | null;
  masterCvName: string | null;
  originalAtsScore: number | null;
  originalMatchedKeywords: string[];
  originalMissingKeywords: string[];
  originalAtsExplanation: string | null;
  originalReviewDetails: {
    strengths: string[];
    priorityActions: string[];
    requirements: CvRequirement[];
    confidence: "high" | "medium" | "low";
    confidenceExplanation: string;
  } | null;
  tailoredAtsScore: number | null;
  tailoredMatchedKeywords: string[];
  tailoredMissingKeywords: string[];
  tailoredPdfFileName: string | null;
  coverLetter: {
    language: string;
    subject: string;
    paragraphs: string[];
    evidence: Array<{ claim: string; evidenceText: string }>;
  } | null;
  coverLetterPdfFileName: string | null;
  interviewQuestions: string[];
  interviewAnswers: string[];
  interviewQuestionsPdfFileName: string | null;
}

interface UpdatedJobDetailsResponse {
  description: string;
  location: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  recruiterLinkedInUrl: string | null;
  salaryRange: string | null;
  workArrangement: WorkArrangement;
  personalNotes: string | null;
}

export interface JobKanbanBoardProps {
  /**
   * Jobs used to initialize the board. Mount the component after the first job
   * query has completed, or change its React key to replace the board wholesale.
   */
  initialJobs: readonly JobApplication[];
  /**
   * Optional origin for the .NET API, for example "https://api.example.no".
   * An empty value sends requests to the current browser origin.
   */
  apiBaseUrl?: string;
  /**
   * Invoked after the API has confirmed a cross-column status update.
   */
  onStatusChangeConfirmed?: (
    jobId: string,
    status: JobStatus,
  ) => void;
  /**
   * Generates and persists a tailored CV. Reject with an Error to display a
   * rollback-style toast on the card.
   */
  onGenerateTailoredCv?: (jobId: string) => Promise<void>;
  /** Keeps the parent job collection synchronized after metadata edits. */
  onApplicationDetailsUpdated?: (job: JobApplication) => void;
  /** Invoked after an application and its saved preparation were deleted. */
  onApplicationDeleted?: (jobId: string) => void;
}

type JobsByStatus = Record<JobStatus, JobApplication[]>;

interface ColumnStyle {
  title: string;
  columnClassName: string;
  headerClassName: string;
  countClassName: string;
  dropRingClassName: string;
  cardAccentClassName: string;
  avatarClassName: string;
  emptyClassName: string;
}

interface ToastMessage {
  id: number;
  message: string;
}

const COLUMN_STYLES: Record<JobStatus, ColumnStyle> = {
  Applied: {
    title: "Applied",
    columnClassName: "border-[#172033] bg-[#ebe9e2]",
    headerClassName: "border-[#172033] bg-[#3157d5] text-white",
    countClassName: "border border-[#172033] bg-[#ffcc4d] text-[#172033]",
    dropRingClassName: "border-[#3157d5] bg-[#e8edff] ring-[#9fb1f2]",
    cardAccentClassName: "border-l-[#3157d5]",
    avatarClassName: "bg-[#3157d5] text-white",
    emptyClassName: "border-[#172033] bg-white/60 text-[#626979]",
  },
  Interviewing: {
    title: "Interviewing",
    columnClassName: "border-[#172033] bg-[#ebe9e2]",
    headerClassName: "border-[#172033] bg-[#ffcc4d] text-[#172033]",
    countClassName: "border border-[#172033] bg-white text-[#172033]",
    dropRingClassName: "border-[#d39a15] bg-[#fff7d9] ring-[#ead189]",
    cardAccentClassName: "border-l-[#d39a15]",
    avatarClassName: "bg-[#ffcc4d] text-[#172033]",
    emptyClassName: "border-[#172033] bg-white/60 text-[#626979]",
  },
  Offer: {
    title: "Offer",
    columnClassName: "border-[#172033] bg-[#ebe9e2]",
    headerClassName: "border-[#172033] bg-[#258b57] text-white",
    countClassName: "border border-[#172033] bg-white text-[#172033]",
    dropRingClassName: "border-[#258b57] bg-[#e4f3ea] ring-[#9dccb2]",
    cardAccentClassName: "border-l-[#258b57]",
    avatarClassName: "bg-[#258b57] text-white",
    emptyClassName: "border-[#172033] bg-white/60 text-[#626979]",
  },
  Rejected: {
    title: "Rejected",
    columnClassName: "border-[#172033] bg-[#ebe9e2]",
    headerClassName: "border-[#172033] bg-[#d84d3d] text-white",
    countClassName: "border border-[#172033] bg-white text-[#172033]",
    dropRingClassName: "border-[#d84d3d] bg-[#fbe8e5] ring-[#e7aaa2]",
    cardAccentClassName: "border-l-[#d84d3d]",
    avatarClassName: "bg-[#d84d3d] text-white",
    emptyClassName: "border-[#172033] bg-white/60 text-[#626979]",
  },
};

const EMPTY_BOARD: JobsByStatus = {
  Applied: [],
  Interviewing: [],
  Offer: [],
  Rejected: [],
};

function isJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.some((status) => status === value);
}

function createBoard(jobs: readonly JobApplication[]): JobsByStatus {
  const board: JobsByStatus = {
    Applied: [],
    Interviewing: [],
    Offer: [],
    Rejected: [],
  };

  for (const job of jobs) {
    board[job.status].push({ ...job });
  }

  return board;
}

function moveJob(
  board: JobsByStatus,
  jobId: string,
  sourceStatus: JobStatus,
  sourceIndex: number,
  destinationStatus: JobStatus,
  destinationIndex: number,
): JobsByStatus {
  const sourceJobs = [...board[sourceStatus]];
  const resolvedSourceIndex =
    sourceJobs[sourceIndex]?.id === jobId
      ? sourceIndex
      : sourceJobs.findIndex((job) => job.id === jobId);

  if (resolvedSourceIndex < 0) {
    return board;
  }

  const [sourceJob] = sourceJobs.splice(resolvedSourceIndex, 1);
  if (!sourceJob) {
    return board;
  }

  if (sourceStatus === destinationStatus) {
    sourceJobs.splice(
      Math.min(destinationIndex, sourceJobs.length),
      0,
      sourceJob,
    );

    return {
      ...board,
      [sourceStatus]: sourceJobs,
    };
  }

  const destinationJobs = [...board[destinationStatus]];
  destinationJobs.splice(
    Math.min(destinationIndex, destinationJobs.length),
    0,
    { ...sourceJob, status: destinationStatus },
  );

  return {
    ...board,
    [sourceStatus]: sourceJobs,
    [destinationStatus]: destinationJobs,
  };
}

function rollbackJob(
  board: JobsByStatus,
  jobId: string,
  optimisticStatus: JobStatus,
  originalStatus: JobStatus,
  originalIndex: number,
): JobsByStatus {
  const optimisticJobs = [...board[optimisticStatus]];
  const currentIndex = optimisticJobs.findIndex((job) => job.id === jobId);

  if (currentIndex < 0) {
    return board;
  }

  const [job] = optimisticJobs.splice(currentIndex, 1);
  if (!job) {
    return board;
  }

  const originalJobs = [...board[originalStatus]];
  originalJobs.splice(
    Math.min(originalIndex, originalJobs.length),
    0,
    { ...job, status: originalStatus },
  );

  return {
    ...board,
    [optimisticStatus]: optimisticJobs,
    [originalStatus]: originalJobs,
  };
}

function formatAppliedDate(value: string): string {
  const parsedDate = parseISO(value);

  if (!isValid(parsedDate)) {
    return value;
  }

  return format(parsedDate, "dd. MMM yyyy", { locale: nb });
}

function workArrangementLabel(value: WorkArrangement): string {
  switch (value) {
    case "OnSite":
      return "On-site";
    case "Hybrid":
      return "Hybrid";
    case "Remote":
      return "Remote";
    default:
      return "Not specified";
  }
}

function getAtsBadge(score: number | null): {
  label: string;
  className: string;
} {
  if (score === null) {
    return {
      label: "Not scored",
      className: "bg-slate-100 text-slate-600 ring-slate-500/20",
    };
  }

  const normalizedScore = Math.min(100, Math.max(0, Math.round(score)));

  if (normalizedScore > 75) {
    return {
      label: `${normalizedScore}% ATS`,
      className: "bg-green-100 text-green-800 ring-green-600/20",
    };
  }

  if (normalizedScore >= 50) {
    return {
      label: `${normalizedScore}% ATS`,
      className: "bg-yellow-100 text-yellow-800 ring-yellow-600/20",
    };
  }

  return {
    label: `${normalizedScore}% ATS`,
    className: "bg-red-100 text-red-800 ring-red-600/20",
  };
}

function joinApiUrl(apiBaseUrl: string, path: string): string {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, "");
  return `${normalizedBase}${path}`;
}

function isSafePdfUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const parsedUrl = new URL(value, "https://job-tracker.local");
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeExternalUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function PdfIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H8.25m0 11.625h4.5m-4.5 3h4.5m2.25-14.25v4.5a.75.75 0 0 0 .75.75h4.5M6.75 2.25h3.375c.621 0 1.216.247 1.655.686l5.284 5.284c.439.439.686 1.034.686 1.655v9.375A2.25 2.25 0 0 1 15.5 21.5h-8.75A2.25 2.25 0 0 1 4.5 19.25V4.5a2.25 2.25 0 0 1 2.25-2.25Z"
      />
    </svg>
  );
}

function RefreshIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992V4.356m-.97 10.122A8.25 8.25 0 1 1 6.41 5.18L2.985 8.607"
      />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function ApplicationDetailsModal({
  job,
  applicationPackage,
  isLoading,
  error,
  apiBaseUrl,
  isDeleting,
  onSaveDetails,
  onSaveDescription,
  onSaveInterviewAnswers,
  onDelete,
  onClose,
}: {
  job: JobApplication;
  applicationPackage: LoggedApplicationPackage | null;
  isLoading: boolean;
  error: string | null;
  apiBaseUrl: string;
  isDeleting: boolean;
  onSaveDetails: (details: EditableJobDetails) => Promise<void>;
  onSaveDescription: (description: string) => Promise<void>;
  onSaveInterviewAnswers: (answers: string[]) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(job.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [interviewAnswers, setInterviewAnswers] = useState<string[]>([]);
  const [isSavingAnswers, setIsSavingAnswers] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [editableDetails, setEditableDetails] = useState<EditableJobDetails>(() => ({
    location: job.location ?? "",
    recruiterName: job.recruiterName ?? "",
    recruiterEmail: job.recruiterEmail ?? "",
    recruiterLinkedInUrl: job.recruiterLinkedInUrl ?? "",
    salaryRange: job.salaryRange ?? "",
    workArrangement: job.workArrangement,
    personalNotes: job.personalNotes ?? "",
  }));

  useEffect(() => {
    setInterviewAnswers(
      applicationPackage?.interviewQuestions.map(
        (_, index) => applicationPackage.interviewAnswers?.[index] ?? "",
      ) ?? [],
    );
    setAnswerError(null);
  }, [applicationPackage?.id]);

  useEffect(() => {
    setDescriptionDraft(job.description);
    setDescriptionError(null);
    setIsEditingDescription(false);
  }, [job.id, job.description]);

  async function saveDetails(): Promise<void> {
    setSaveError(null);
    setIsSavingDetails(true);
    try {
      await onSaveDetails(editableDetails);
      setIsEditingDetails(false);
    } catch (saveDetailsError) {
      setSaveError(
        saveDetailsError instanceof Error
          ? saveDetailsError.message
          : "Application details could not be saved.",
      );
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function saveAnswers(): Promise<void> {
    setAnswerError(null);
    setIsSavingAnswers(true);
    try {
      await onSaveInterviewAnswers(interviewAnswers);
    } catch (saveAnswersError) {
      setAnswerError(
        saveAnswersError instanceof Error
          ? saveAnswersError.message
          : "Interview answers could not be saved.",
      );
    } finally {
      setIsSavingAnswers(false);
    }
  }

  async function saveDescription(): Promise<void> {
    const normalizedDescription = descriptionDraft.trim();
    if (!normalizedDescription) {
      setDescriptionError("The vacancy description cannot be empty.");
      return;
    }

    setDescriptionError(null);
    setIsSavingDescription(true);
    try {
      await onSaveDescription(normalizedDescription);
      setDescriptionDraft(normalizedDescription);
      setIsEditingDescription(false);
    } catch (saveDescriptionError) {
      setDescriptionError(
        saveDescriptionError instanceof Error
          ? saveDescriptionError.message
          : "The vacancy description could not be saved.",
      );
    } finally {
      setIsSavingDescription(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const draftId = applicationPackage?.id;
  const coverLetterPdfUrl =
    draftId && applicationPackage.coverLetterPdfFileName
      ? joinApiUrl(
          apiBaseUrl,
          `/api/application-workflow/draft/${encodeURIComponent(draftId)}/cover-letter/pdf?download=true`,
        )
      : null;
  const questionsPdfUrl =
    draftId && applicationPackage.interviewQuestionsPdfFileName
      ? joinApiUrl(
          apiBaseUrl,
          `/api/application-workflow/draft/${encodeURIComponent(draftId)}/interview-questions/pdf?download=true`,
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/70 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-details-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border-2 border-[#172033] bg-[#f8f6f0] shadow-[8px_8px_0_#172033]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b-2 border-[#172033] bg-[#f8f6f0] p-4 sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#172033] bg-[#3157d5] px-2.5 py-1 text-[10px] font-black uppercase text-white">
                {job.status}
              </span>
              {job.categoryName ? (
                <span className="rounded-full border border-[#172033] bg-[#ffcc4d] px-2.5 py-1 text-[10px] font-black uppercase text-[#172033]">
                  {job.categoryName}
                </span>
              ) : null}
            </div>
            <h2
              id="application-details-title"
              className="mt-3 text-2xl font-black tracking-tight text-[#172033] sm:text-3xl"
            >
              {job.title}
            </h2>
            <p className="mt-1 text-sm font-bold text-[#626979]">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-[#172033] bg-white hover:bg-[#ffcc4d]"
            aria-label="Close application details"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="space-y-5 p-4 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border-2 border-[#c3c5ca] bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#777b84]">
                Applied
              </p>
              <p className="mt-1 text-sm font-black">{formatAppliedDate(job.appliedDate)}</p>
            </div>
            <div className="rounded-md border-2 border-[#c3c5ca] bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#777b84]">
                Current ATS
              </p>
              <p className="mt-1 text-sm font-black">
                {job.atsMatchScore == null ? "Not reviewed" : `${Math.round(job.atsMatchScore)}%`}
              </p>
            </div>
            {isSafeExternalUrl(job.jobUrl) ? (
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border-2 border-[#172033] bg-[#eef2ff] p-3 text-sm font-black text-[#3157d5] underline decoration-2 underline-offset-4"
              >
                Open original vacancy ↗
              </a>
            ) : (
              <div className="rounded-md border-2 border-[#c3c5ca] bg-white p-3 text-xs font-bold text-[#626979]">
                Original vacancy link unavailable
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border-2 border-[#172033] bg-[#fffdf8] shadow-[4px_4px_0_#ffcc4d]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#172033] bg-gradient-to-r from-[#eef2ff] via-white to-[#fff4cb] px-4 py-4 sm:px-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#3157d5]">
                  Application information
                </p>
                <h3 className="mt-1 text-xl font-black">Application details</h3>
                <p className="mt-1 text-xs font-medium text-[#626979]">
                  Keep the practical details and your own follow-up notes together.
                </p>
              </div>
              {!isEditingDetails ? (
                <button
                  type="button"
                  onClick={() => {
                    setSaveError(null);
                    setIsEditingDetails(true);
                  }}
                  className="rounded-full border-2 border-[#172033] bg-white px-4 py-2 text-xs font-black text-[#172033] shadow-[2px_2px_0_#3157d5] transition hover:-translate-y-0.5 hover:bg-[#3157d5] hover:text-white"
                >
                  Edit details
                </button>
              ) : null}
            </div>

            {isEditingDetails ? (
              <div className="m-4 rounded-xl border border-[#cfd5e7] bg-[#f7f8ff] p-4 sm:m-5 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3157d5] text-sm font-black text-white">1</span>
                  <div>
                    <h4 className="text-sm font-black">Contact and role information</h4>
                    <p className="text-[11px] text-[#626979]">Add only the information useful for following up this application.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-black text-[#3f4657]">
                    Recruiter name
                    <input
                      type="text"
                      maxLength={200}
                      value={editableDetails.recruiterName}
                      onChange={(event) => setEditableDetails((current) => ({ ...current, recruiterName: event.target.value }))}
                      placeholder="Name of recruiter or hiring contact"
                      className="mt-1.5 w-full rounded-lg border border-[#b9c1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                    />
                  </label>
                  <label className="text-xs font-black text-[#3f4657]">
                    Recruiter email
                    <input
                      type="email"
                      maxLength={320}
                      value={editableDetails.recruiterEmail}
                      onChange={(event) => setEditableDetails((current) => ({ ...current, recruiterEmail: event.target.value }))}
                      placeholder="name@company.com"
                      className="mt-1.5 w-full rounded-lg border border-[#b9c1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                    />
                  </label>
                  <label className="text-xs font-black text-[#3f4657]">
                    Recruiter LinkedIn
                    <input
                      type="url"
                      maxLength={2048}
                      value={editableDetails.recruiterLinkedInUrl}
                      onChange={(event) => setEditableDetails((current) => ({ ...current, recruiterLinkedInUrl: event.target.value }))}
                      placeholder="https://www.linkedin.com/in/..."
                      className="mt-1.5 w-full rounded-lg border border-[#b9c1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                    />
                  </label>
                  <label className="text-xs font-black text-[#3f4657]">
                    Salary range
                    <input
                      type="text"
                      maxLength={200}
                      value={editableDetails.salaryRange}
                      onChange={(event) => setEditableDetails((current) => ({ ...current, salaryRange: event.target.value }))}
                      placeholder="For example, 550,000–650,000 NOK"
                      className="mt-1.5 w-full rounded-lg border border-[#b9c1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                    />
                  </label>
                  <label className="text-xs font-black text-[#3f4657]">
                    Work arrangement
                    <select
                      value={editableDetails.workArrangement}
                      onChange={(event) => setEditableDetails((current) => ({ ...current, workArrangement: event.target.value as WorkArrangement }))}
                      className="mt-1.5 w-full rounded-lg border border-[#b9c1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                    >
                      <option value="Unspecified">Not specified</option>
                      <option value="OnSite">On-site</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="Remote">Remote</option>
                    </select>
                  </label>
                  <label className="text-xs font-black text-[#3f4657]">
                    Location
                    <input
                      type="text"
                      maxLength={200}
                      value={editableDetails.location}
                      onChange={(event) => setEditableDetails((current) => ({ ...current, location: event.target.value }))}
                      placeholder="For example, Oslo"
                      className="mt-1.5 w-full rounded-lg border border-[#b9c1d9] bg-white px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                    />
                  </label>
                </div>
                <label className="mt-5 block rounded-lg border border-[#efd37e] bg-[#fff9e7] p-4 text-xs font-black text-[#3f4657]">
                  Personal notes
                  <textarea
                    rows={5}
                    maxLength={10_000}
                    value={editableDetails.personalNotes}
                    onChange={(event) => setEditableDetails((current) => ({ ...current, personalNotes: event.target.value }))}
                    placeholder="Add follow-up notes, interview impressions, or anything you want to remember."
                    className="mt-2 w-full resize-y rounded-lg border border-[#d4bc74] bg-white px-3 py-2.5 text-sm font-medium leading-6 outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#ffe9a8]"
                  />
                </label>
                {saveError ? (
                  <p role="alert" className="mt-3 rounded-md border border-[#dca399] bg-[#fff1ee] px-3 py-2 text-xs font-bold text-[#8b3d32]">
                    {saveError}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSavingDetails}
                    onClick={() => void saveDetails()}
                    className="rounded-full border-2 border-[#172033] bg-[#3157d5] px-5 py-2.5 text-xs font-black text-white shadow-[2px_2px_0_#172033] transition hover:-translate-y-0.5 hover:bg-[#2448bb] disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingDetails ? "Saving…" : "Save details"}
                  </button>
                  <button
                    type="button"
                    disabled={isSavingDetails}
                    onClick={() => {
                      setEditableDetails({
                        location: job.location ?? "",
                        recruiterName: job.recruiterName ?? "",
                        recruiterEmail: job.recruiterEmail ?? "",
                        recruiterLinkedInUrl: job.recruiterLinkedInUrl ?? "",
                        salaryRange: job.salaryRange ?? "",
                        workArrangement: job.workArrangement,
                        personalNotes: job.personalNotes ?? "",
                      });
                      setSaveError(null);
                      setIsEditingDetails(false);
                    }}
                    className="rounded-full border border-[#aeb4c2] bg-white px-5 py-2.5 text-xs font-black text-[#555d6d] transition hover:border-[#172033] hover:text-[#172033]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.05fr_1.4fr]">
                <article className="relative overflow-hidden rounded-xl border border-[#aebbe7] bg-[#eef2ff] p-4">
                  <div className="absolute right-0 top-0 h-16 w-16 translate-x-5 -translate-y-5 rounded-full bg-[#ff6b57]/30" />
                  <div className="relative flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#172033] bg-[#ff6b57] text-sm font-black text-white">
                      {job.recruiterName?.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#3157d5]">Hiring contact</p>
                      <p className="mt-1 truncate text-base font-black text-[#172033]">
                        {job.recruiterName || "No recruiter added"}
                      </p>
                      {!job.recruiterEmail && !isSafeExternalUrl(job.recruiterLinkedInUrl) ? (
                        <p className="mt-2 text-xs leading-5 text-[#626979]">Add a contact when you know who is handling the role.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="relative mt-4 flex flex-wrap gap-2">
                    {job.recruiterEmail ? (
                      <a className="rounded-full border border-[#9cace5] bg-white px-3 py-1.5 text-xs font-black text-[#3157d5] transition hover:border-[#3157d5]" href={`mailto:${job.recruiterEmail}`}>
                        Email contact
                      </a>
                    ) : null}
                    {isSafeExternalUrl(job.recruiterLinkedInUrl) ? (
                      <a className="rounded-full border border-[#9cace5] bg-white px-3 py-1.5 text-xs font-black text-[#3157d5] transition hover:border-[#3157d5]" href={job.recruiterLinkedInUrl} target="_blank" rel="noreferrer">
                        View LinkedIn ↗
                      </a>
                    ) : null}
                  </div>
                </article>

                <article className="rounded-xl border border-[#e7c65f] bg-[#fff7d9] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#80600d]">Role snapshot</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-white/80 p-3">
                      <p className="text-[9px] font-black uppercase tracking-wide text-[#8b7440]">Salary</p>
                      <p className="mt-1 break-words text-sm font-black text-[#172033]">{job.salaryRange || "Not added"}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 p-3">
                      <p className="text-[9px] font-black uppercase tracking-wide text-[#8b7440]">Work style</p>
                      <p className="mt-1 text-sm font-black text-[#172033]">{workArrangementLabel(job.workArrangement)}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 p-3">
                      <p className="text-[9px] font-black uppercase tracking-wide text-[#8b7440]">Location</p>
                      <p className="mt-1 break-words text-sm font-black text-[#172033]">{job.location || "Not added"}</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-xl border border-[#9fc9ae] bg-[#edf7ef] p-4 lg:col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#2f7d4a]" />
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#315f3d]">Personal notes</p>
                  </div>
                  <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${job.personalNotes ? "text-[#3f5145]" : "italic text-[#6f7e73]"}`}>
                    {job.personalNotes || "No notes yet. Add reminders, follow-up dates, or interview impressions here."}
                  </p>
                </article>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border-2 border-[#172033] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9dce5] bg-[#f7f8fc] px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#777b84]">Vacancy</p>
                <h3 className="mt-0.5 text-sm font-black">Full vacancy description</h3>
              </div>
              {!isEditingDescription ? (
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionDraft(job.description);
                    setDescriptionError(null);
                    setIsEditingDescription(true);
                  }}
                  className="rounded-full border border-[#aeb4c2] bg-white px-3 py-1.5 text-xs font-black text-[#3157d5] transition hover:border-[#3157d5] hover:bg-[#eef2ff]"
                >
                  Edit description
                </button>
              ) : null}
            </div>

            {isEditingDescription ? (
              <div className="p-4">
                <label className="block text-xs font-black text-[#3f4657]">
                  Vacancy description
                  <textarea
                    autoFocus
                    required
                    rows={14}
                    maxLength={100_000}
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    className="mt-2 w-full resize-y rounded-lg border-2 border-[#b9c1d9] bg-[#fffdf8] px-3 py-3 text-sm font-medium leading-6 text-[#404658] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dce4ff]"
                  />
                </label>
                <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold text-[#777b84]">
                  <span>Keep the original requirements and responsibilities accurate.</span>
                  <span>{descriptionDraft.length.toLocaleString()} / 100,000</span>
                </div>
                {descriptionError ? (
                  <p role="alert" className="mt-3 rounded-md border border-[#dca399] bg-[#fff1ee] px-3 py-2 text-xs font-bold text-[#8b3d32]">
                    {descriptionError}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSavingDescription || !descriptionDraft.trim()}
                    onClick={() => void saveDescription()}
                    className="rounded-full border-2 border-[#172033] bg-[#3157d5] px-5 py-2.5 text-xs font-black text-white shadow-[2px_2px_0_#172033] transition hover:-translate-y-0.5 hover:bg-[#2448bb] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingDescription ? "Saving…" : "Save description"}
                  </button>
                  <button
                    type="button"
                    disabled={isSavingDescription}
                    onClick={() => {
                      setDescriptionDraft(job.description);
                      setDescriptionError(null);
                      setIsEditingDescription(false);
                    }}
                    className="rounded-full border border-[#aeb4c2] bg-white px-5 py-2.5 text-xs font-black text-[#555d6d] transition hover:border-[#172033]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <details open className="group">
                <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-[#3157d5] marker:hidden">
                  <span className="group-open:hidden">Show description</span>
                  <span className="hidden group-open:inline">Hide description</span>
                </summary>
                <div className="max-h-96 overflow-y-auto whitespace-pre-wrap border-t border-[#e3e4e8] px-4 py-4 text-sm leading-6 text-[#404658]">
                  {job.description}
                </div>
              </details>
            )}
          </section>

          {isLoading ? (
            <div className="animate-pulse rounded-md border-2 border-[#9ca1ad] bg-white p-5 text-sm font-bold text-[#626979]">
              Loading saved preparation…
            </div>
          ) : error ? (
            <div role="alert" className="rounded-md border-2 border-[#a54538] bg-[#ffe1dc] p-4 text-sm font-bold text-[#7f3026]">
              {error}
            </div>
          ) : applicationPackage ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
              <section className="order-2 rounded-md border-2 border-[#172033] bg-white p-4 sm:p-5 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-black">ATS review</h3>
                  {applicationPackage.originalReviewDetails ? (
                    <span className="rounded-full border border-[#3157d5] bg-[#eef2ff] px-2.5 py-1 text-[10px] font-black uppercase text-[#3157d5]">
                      {applicationPackage.originalReviewDetails.confidence} confidence
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-md border-2 border-[#d2b36a] bg-[#fff7d9] p-3">
                    <p className="text-[10px] font-black uppercase text-[#6d4e08]">Original</p>
                    <p className="mt-1 text-3xl font-black text-[#6d4e08]">
                      {applicationPackage.originalAtsScore == null
                        ? "—"
                        : `${Math.round(applicationPackage.originalAtsScore)}%`}
                    </p>
                  </div>
                  <div className="rounded-md border-2 border-[#8eb69a] bg-[#edf7ef] p-3">
                    <p className="text-[10px] font-black uppercase text-[#315f3d]">Tailored</p>
                    <p className="mt-1 text-3xl font-black text-[#315f3d]">
                      {applicationPackage.tailoredAtsScore == null
                        ? "—"
                        : `${Math.round(applicationPackage.tailoredAtsScore)}%`}
                    </p>
                  </div>
                </div>
                {applicationPackage.originalAtsExplanation ? (
                  <p className="mt-4 text-sm leading-6 text-[#545b6b]">
                    {applicationPackage.originalAtsExplanation}
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#315f3d]">
                      Verified matches
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {applicationPackage.originalMatchedKeywords.length ? (
                        applicationPackage.originalMatchedKeywords.map((keyword) => (
                          <span key={keyword} className="rounded border border-[#8eb69a] bg-[#edf7ef] px-2 py-1 text-[10px] font-bold text-[#315f3d]">
                            {keyword}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#626979]">No verified matches saved.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#8b3d32]">
                      Remaining gaps
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(applicationPackage.tailoredAtsScore == null
                        ? applicationPackage.originalMissingKeywords
                        : applicationPackage.tailoredMissingKeywords
                      ).length ? (
                        (applicationPackage.tailoredAtsScore == null
                          ? applicationPackage.originalMissingKeywords
                          : applicationPackage.tailoredMissingKeywords
                        ).map((keyword) => (
                          <span key={keyword} className="rounded border border-[#e8b4ab] bg-[#fff1ee] px-2 py-1 text-[10px] font-bold text-[#8b3d32]">
                            {keyword}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#626979]">No unsupported requirements saved.</span>
                      )}
                    </div>
                  </div>
                </div>
                {applicationPackage.originalReviewDetails ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-[#8eb69a] bg-[#edf7ef] p-3">
                      <p className="text-xs font-black text-[#315f3d]">Strengths</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-[#315f3d]">
                        {(applicationPackage.originalReviewDetails.strengths ?? []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded border border-[#d2b36a] bg-[#fff7d9] p-3">
                      <p className="text-xs font-black text-[#6d4e08]">Next actions</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-[#6d4e08]">
                        {(applicationPackage.originalReviewDetails.priorityActions ?? []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
                {applicationPackage.originalReviewDetails?.requirements?.length ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {applicationPackage.originalReviewDetails.requirements.map((requirement) => (
                      <article
                        key={`${requirement.category}-${requirement.keyword}`}
                        className={`rounded border p-3 ${
                          requirement.status === "matched"
                            ? "border-[#8eb69a] bg-[#edf7ef]"
                            : "border-[#e8b4ab] bg-[#fff1ee]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black">{requirement.keyword}</span>
                          <span className="text-[9px] font-black uppercase text-[#626979]">
                            {requirement.category} · {requirement.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-[#626979]">
                          {requirement.evidenceText ?? "No supporting CV evidence."}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="contents">
                <article className="order-1 rounded-md border-2 border-[#172033] bg-white p-4 lg:col-span-2">
                  <h3 className="font-black">Saved documents</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-[#d9d9d3] bg-[#f8f7f2] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#777b84]">CV used</p>
                      <p className="mt-1 text-xs font-bold text-[#3f4657]">
                        {applicationPackage.masterCvName || "Source CV name unavailable"}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-[#777b84]">
                        {job.tailoredPdfUrl ? "Tailored version prepared for this role" : "Original selected CV"}
                      </p>
                    </div>
                    <div className="rounded-md border border-[#d9d9d3] bg-[#f8f7f2] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#777b84]">Cover letter</p>
                      <p className="mt-1 text-xs font-bold text-[#3f4657]">
                        {coverLetterPdfUrl ? "Saved for this application" : "Not created"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.tailoredPdfUrl ? (
                      <a href={job.tailoredPdfUrl} target="_blank" rel="noreferrer" className="rounded-md border-2 border-[#172033] bg-[#eef2ff] px-3 py-2 text-xs font-black">
                        Tailored CV PDF
                      </a>
                    ) : null}
                    {coverLetterPdfUrl ? (
                      <a href={coverLetterPdfUrl} className="rounded-md border-2 border-[#172033] bg-[#ffcc4d] px-3 py-2 text-xs font-black">
                        Cover letter PDF
                      </a>
                    ) : null}
                    {!job.tailoredPdfUrl && !coverLetterPdfUrl ? (
                      <p className="text-xs text-[#626979]">No generated documents were saved.</p>
                    ) : null}
                  </div>
                  {applicationPackage.coverLetter ? (
                    <details className="mt-4 border-t border-[#deded9] pt-3">
                      <summary className="cursor-pointer text-xs font-black text-[#3157d5]">
                        Read cover letter
                      </summary>
                      <h4 className="mt-3 text-sm font-black">{applicationPackage.coverLetter.subject}</h4>
                      <div className="mt-3 space-y-3 text-xs leading-5 text-[#545b6b]">
                        {applicationPackage.coverLetter.paragraphs.map((paragraph, index) => (
                          <p key={`${index}-${paragraph}`}>{paragraph}</p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </article>

                <article className="order-3 rounded-md border-2 border-[#172033] bg-white p-4 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black">Interview preparation</h3>
                    {questionsPdfUrl ? (
                      <a href={questionsPdfUrl} className="text-xs font-black text-[#3157d5] underline underline-offset-2">
                        Download PDF
                      </a>
                    ) : null}
                  </div>
                  {applicationPackage.interviewQuestions.length ? (
                    <>
                      <ol className="mt-3 space-y-3">
                        {applicationPackage.interviewQuestions.map((question, index) => (
                          <li key={`${index}-${question}`} className="rounded-md border border-[#d9d9d3] bg-[#f8f7f2] p-3">
                            <div className="flex gap-2 text-xs leading-5 text-[#4f5665]">
                              <span className="font-black text-[#3157d5]">{index + 1}.</span>
                              <span className="font-bold">{question}</span>
                            </div>
                            <label className="mt-2 block text-[9px] font-black uppercase tracking-wide text-[#777b84]">
                              Your answer
                              <textarea
                                rows={3}
                                maxLength={5_000}
                                value={interviewAnswers[index] ?? ""}
                                onChange={(event) => setInterviewAnswers((current) => applicationPackage.interviewQuestions.map(
                                  (_, answerIndex) => answerIndex === index ? event.target.value : current[answerIndex] ?? "",
                                ))}
                                placeholder="Add your example or talking points…"
                                className="mt-1.5 w-full resize-y rounded-md border border-[#bfc2ca] bg-white px-3 py-2 text-xs font-medium normal-case leading-5 tracking-normal text-[#3f4657] outline-none focus:border-[#3157d5]"
                              />
                            </label>
                          </li>
                        ))}
                      </ol>
                      {answerError ? (
                        <p role="alert" className="mt-3 rounded-md border border-[#dca399] bg-[#fff1ee] px-3 py-2 text-xs font-bold text-[#8b3d32]">
                          {answerError}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={isSavingAnswers}
                        onClick={() => void saveAnswers()}
                        className="mt-3 rounded-md border-2 border-[#172033] bg-[#3157d5] px-3 py-2 text-xs font-black text-white transition hover:bg-[#2448bb] disabled:cursor-wait disabled:opacity-60"
                      >
                        {isSavingAnswers ? "Saving answers…" : "Save my answers"}
                      </button>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-[#626979]">
                      No interview questions were generated for this application.
                    </p>
                  )}
                </article>
              </section>
              </div>
            </>
          ) : (
            <div className="rounded-md border-2 border-[#b8bac0] bg-white p-4 text-sm text-[#626979]">
              This application was saved without an ATS review, tailored CV, cover
              letter, or interview preparation. The full vacancy is still available above.
            </div>
          )}

          <section className="rounded-md border-2 border-[#e8b4ab] bg-[#fff1ee] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-[#7f3026]">Delete application</h3>
                <p className="mt-1 text-xs leading-5 text-[#8b3d32]">
                  Removes the Kanban card and its saved CV, cover-letter, ATS, and
                  interview-preparation artifacts. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={onDelete}
                className="shrink-0 rounded-md border-2 border-[#7f3026] bg-[#d84d3d] px-4 py-2.5 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
              >
                {isDeleting ? "Deleting…" : "Delete application"}
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function JobKanbanBoard({
  initialJobs,
  apiBaseUrl = "",
  onStatusChangeConfirmed,
  onGenerateTailoredCv,
  onApplicationDetailsUpdated,
  onApplicationDeleted,
}: JobKanbanBoardProps): JSX.Element {
  const [jobsByStatus, setJobsByStatus] = useState<JobsByStatus>(() =>
    createBoard(initialJobs),
  );
  const [pendingJobIds, setPendingJobIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [tailoringJobIds, setTailoringJobIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobApplication | null>(null);
  const [applicationPackage, setApplicationPackage] =
    useState<LoggedApplicationPackage | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [deletingJobIds, setDeletingJobIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const requestControllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    return () => {
      for (const controller of requestControllers.current.values()) {
        controller.abort();
      }
      requestControllers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const persistStatus = useCallback(
    async (
      jobId: string,
      jobTitle: string,
      optimisticStatus: JobStatus,
      originalStatus: JobStatus,
      originalIndex: number,
    ): Promise<void> => {
      const controller = new AbortController();
      requestControllers.current.set(jobId, controller);

      try {
        const response = await apiFetch(
          apiBaseUrl,
          `/api/jobs/${encodeURIComponent(jobId)}/status`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ status: optimisticStatus }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Status update failed with HTTP ${response.status}.`);
        }

        onStatusChangeConfirmed?.(jobId, optimisticStatus);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setJobsByStatus((currentBoard) =>
          rollbackJob(
            currentBoard,
            jobId,
            optimisticStatus,
            originalStatus,
            originalIndex,
          ),
        );
        setToast({
          id: Date.now(),
          message: `Could not move “${jobTitle}”. The card was restored to ${originalStatus}.`,
        });
      } finally {
        requestControllers.current.delete(jobId);
        setPendingJobIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(jobId);
          return nextIds;
        });
      }
    },
    [apiBaseUrl, onStatusChangeConfirmed],
  );

  const handleDragEnd = useCallback(
    (result: DropResult): void => {
      const { destination, draggableId, source } = result;

      if (
        !destination ||
        !isJobStatus(source.droppableId) ||
        !isJobStatus(destination.droppableId)
      ) {
        return;
      }

      const originalStatus = source.droppableId;
      const destinationStatus = destination.droppableId;

      if (
        originalStatus === destinationStatus &&
        source.index === destination.index
      ) {
        return;
      }

      const job = jobsByStatus[originalStatus].find(
        (candidate) => candidate.id === draggableId,
      );

      if (!job || pendingJobIds.has(job.id)) {
        return;
      }

      setJobsByStatus((currentBoard) =>
        moveJob(
          currentBoard,
          job.id,
          originalStatus,
          source.index,
          destinationStatus,
          destination.index,
        ),
      );

      // Same-column ordering is local because the current backend contract stores
      // status, not a persistent sort position.
      if (originalStatus === destinationStatus) {
        return;
      }

      setPendingJobIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(job.id);
        return nextIds;
      });

      void persistStatus(
        job.id,
        job.title,
        destinationStatus,
        originalStatus,
        source.index,
      );
    },
    [jobsByStatus, pendingJobIds, persistStatus],
  );

  const generateTailoredCv = useCallback(
    async (job: JobApplication): Promise<void> => {
      if (!onGenerateTailoredCv || tailoringJobIds.has(job.id)) {
        return;
      }

      setTailoringJobIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(job.id);
        return nextIds;
      });

      try {
        await onGenerateTailoredCv(job.id);
      } catch (error) {
        setToast({
          id: Date.now(),
          message:
            error instanceof Error
              ? error.message
              : `Could not tailor the CV for “${job.title}”.`,
        });
      } finally {
        setTailoringJobIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(job.id);
          return nextIds;
        });
      }
    },
    [onGenerateTailoredCv, tailoringJobIds],
  );

  const closeDetails = useCallback(() => {
    setSelectedJob(null);
    setApplicationPackage(null);
    setDetailsError(null);
  }, []);

  const openDetails = useCallback(
    async (job: JobApplication): Promise<void> => {
      setSelectedJob(job);
      setApplicationPackage(null);
      setDetailsError(null);
      setIsLoadingDetails(true);
      try {
        const response = await apiFetch(
          apiBaseUrl,
          `/api/application-workflow/logged/${encodeURIComponent(job.id)}`,
          { headers: { Accept: "application/json" } },
        );
        if (response.status === 404) {
          return;
        }
        if (!response.ok) {
          let message = `Application details failed with HTTP ${response.status}.`;
          try {
            const problem = (await response.json()) as { detail?: string; title?: string };
            message = problem.detail || problem.title || message;
          } catch {
            // Keep the bounded fallback message when the response is not JSON.
          }
          throw new Error(message);
        }
        setApplicationPackage((await response.json()) as LoggedApplicationPackage);
      } catch (loadError) {
        setDetailsError(
          loadError instanceof Error
            ? loadError.message
            : "The saved application details could not be loaded.",
        );
      } finally {
        setIsLoadingDetails(false);
      }
    },
    [apiBaseUrl],
  );

  const saveApplicationDetails = useCallback(
    async (details: EditableJobDetails): Promise<void> => {
      if (!selectedJob) throw new Error("The selected application is no longer available.");

      const response = await apiFetch(
        apiBaseUrl,
        `/api/jobs/${encodeURIComponent(selectedJob.id)}/details`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(details),
        },
      );
      if (!response.ok) {
        let message = `Saving application details failed with HTTP ${response.status}.`;
        try {
          const problem = (await response.json()) as { detail?: string; title?: string; errors?: Record<string, string[]> };
          message = Object.values(problem.errors ?? {}).flat().join(" ") || problem.detail || problem.title || message;
        } catch {
          // Keep the bounded fallback when the response is not JSON.
        }
        throw new Error(message);
      }

      const updated = (await response.json()) as UpdatedJobDetailsResponse;
      const mergeDetails = (job: JobApplication): JobApplication => ({
        ...job,
        description: updated.description,
        location: updated.location,
        recruiterName: updated.recruiterName,
        recruiterEmail: updated.recruiterEmail,
        recruiterLinkedInUrl: updated.recruiterLinkedInUrl,
        salaryRange: updated.salaryRange,
        workArrangement: updated.workArrangement,
        personalNotes: updated.personalNotes,
      });
      const updatedJob = mergeDetails(selectedJob);

      setJobsByStatus((current) => ({
        Applied: current.Applied.map((job) => job.id === selectedJob.id ? mergeDetails(job) : job),
        Interviewing: current.Interviewing.map((job) => job.id === selectedJob.id ? mergeDetails(job) : job),
        Offer: current.Offer.map((job) => job.id === selectedJob.id ? mergeDetails(job) : job),
        Rejected: current.Rejected.map((job) => job.id === selectedJob.id ? mergeDetails(job) : job),
      }));
      setSelectedJob(updatedJob);
      onApplicationDetailsUpdated?.(updatedJob);
      setToast({ id: Date.now(), message: `Details for “${selectedJob.title}” were saved.` });
    },
    [apiBaseUrl, onApplicationDetailsUpdated, selectedJob],
  );

  const saveApplicationDescription = useCallback(
    async (description: string): Promise<void> => {
      if (!selectedJob) throw new Error("The selected application is no longer available.");

      const response = await apiFetch(
        apiBaseUrl,
        `/api/jobs/${encodeURIComponent(selectedJob.id)}/description`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ description }),
        },
      );
      if (!response.ok) {
        let message = `Saving the vacancy description failed with HTTP ${response.status}.`;
        try {
          const problem = (await response.json()) as { detail?: string; title?: string; errors?: Record<string, string[]> };
          message = Object.values(problem.errors ?? {}).flat().join(" ") || problem.detail || problem.title || message;
        } catch {
          // Keep the fallback when an intermediary returns a non-JSON body.
        }
        throw new Error(message);
      }

      const updated = (await response.json()) as UpdatedJobDetailsResponse;
      const mergeDescription = (job: JobApplication): JobApplication => ({
        ...job,
        description: updated.description,
      });
      const updatedJob = mergeDescription(selectedJob);

      setJobsByStatus((current) => ({
        Applied: current.Applied.map((job) => job.id === selectedJob.id ? mergeDescription(job) : job),
        Interviewing: current.Interviewing.map((job) => job.id === selectedJob.id ? mergeDescription(job) : job),
        Offer: current.Offer.map((job) => job.id === selectedJob.id ? mergeDescription(job) : job),
        Rejected: current.Rejected.map((job) => job.id === selectedJob.id ? mergeDescription(job) : job),
      }));
      setSelectedJob(updatedJob);
      onApplicationDetailsUpdated?.(updatedJob);
      setToast({ id: Date.now(), message: `The vacancy description for “${selectedJob.title}” was saved.` });
    },
    [apiBaseUrl, onApplicationDetailsUpdated, selectedJob],
  );

  const saveLoggedInterviewAnswers = useCallback(
    async (answers: string[]): Promise<void> => {
      if (!applicationPackage) {
        throw new Error("The saved interview preparation is no longer available.");
      }

      const response = await apiFetch(
        apiBaseUrl,
        `/api/application-workflow/draft/${encodeURIComponent(applicationPackage.id)}/interview-answers`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ answers }),
        },
      );
      if (!response.ok) {
        let message = `Saving interview answers failed with HTTP ${response.status}.`;
        try {
          const problem = (await response.json()) as { detail?: string; title?: string; errors?: Record<string, string[]> };
          message = Object.values(problem.errors ?? {}).flat().join(" ") || problem.detail || problem.title || message;
        } catch {
          // Keep the fallback when an intermediary returns a non-JSON body.
        }
        throw new Error(message);
      }

      const updated = (await response.json()) as LoggedApplicationPackage;
      setApplicationPackage({
        ...updated,
        interviewQuestions: updated.interviewQuestions ?? [],
        interviewAnswers: (updated.interviewQuestions ?? []).map(
          (_, index) => updated.interviewAnswers?.[index] ?? "",
        ),
      });
      setToast({ id: Date.now(), message: "Your interview answers were saved." });
    },
    [apiBaseUrl, applicationPackage],
  );

  const deleteApplication = useCallback(
    async (job: JobApplication): Promise<void> => {
      const confirmed = window.confirm(
        `Delete “${job.title}” at ${job.company}?\n\nThis also removes its saved ATS review, tailored CV, cover letter, and interview questions. This cannot be undone.`,
      );
      if (!confirmed || deletingJobIds.has(job.id)) return;

      setDeletingJobIds((current) => new Set(current).add(job.id));
      setDetailsError(null);
      try {
        const response = await apiFetch(
          apiBaseUrl,
          `/api/jobs/${encodeURIComponent(job.id)}`,
          { method: "DELETE", headers: { Accept: "application/json" } },
        );
        if (!response.ok) {
          let message = `Delete failed with HTTP ${response.status}.`;
          try {
            const problem = (await response.json()) as { detail?: string; title?: string };
            message = problem.detail || problem.title || message;
          } catch {
            // Keep the fallback when an intermediary returns a non-JSON body.
          }
          throw new Error(message);
        }

        setJobsByStatus((current) => ({
          Applied: current.Applied.filter((item) => item.id !== job.id),
          Interviewing: current.Interviewing.filter((item) => item.id !== job.id),
          Offer: current.Offer.filter((item) => item.id !== job.id),
          Rejected: current.Rejected.filter((item) => item.id !== job.id),
        }));
        closeDetails();
        onApplicationDeleted?.(job.id);
        setToast({
          id: Date.now(),
          message: `“${job.title}” and its saved preparation were deleted.`,
        });
      } catch (deleteError) {
        setDetailsError(
          deleteError instanceof Error
            ? deleteError.message
            : "The application could not be deleted.",
        );
      } finally {
        setDeletingJobIds((current) => {
          const next = new Set(current);
          next.delete(job.id);
          return next;
        });
      }
    },
    [apiBaseUrl, closeDetails, deletingJobIds, onApplicationDeleted],
  );

  return (
    <section aria-label="Job application Kanban board" className="w-full">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {JOB_STATUSES.map((status) => {
            const column = COLUMN_STYLES[status];
            const jobs = jobsByStatus[status] ?? EMPTY_BOARD[status];

            return (
              <div
                key={status}
                className={`flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border-2 shadow-[4px_4px_0_#172033] ${column.columnClassName}`}
              >
                <header
                  className={`flex items-center justify-between border-b px-4 py-3.5 ${column.headerClassName}`}
                >
                  <h2 className="text-sm font-black uppercase tracking-[0.08em]">
                    {column.title}
                  </h2>
                  <span
                    aria-label={`${jobs.length} jobs`}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${column.countClassName}`}
                  >
                    {jobs.length}
                  </span>
                </header>

                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={[
                        "flex min-h-[24rem] flex-1 flex-col gap-3 border-2 border-transparent p-3 transition-colors",
                        snapshot.isDraggingOver
                          ? `ring-2 ring-inset ${column.dropRingClassName}`
                          : "",
                      ].join(" ")}
                    >
                      {jobs.map((job, index) => {
                        const atsBadge = getAtsBadge(job.atsMatchScore);
                        const isSaving = pendingJobIds.has(job.id);
                        const isTailoring = tailoringJobIds.has(job.id);
                        const pdfUrl = isSafePdfUrl(job.tailoredPdfUrl)
                          ? job.tailoredPdfUrl
                          : null;

                        return (
                          <Draggable
                            key={job.id}
                            draggableId={job.id}
                            index={index}
                            isDragDisabled={isSaving || isTailoring}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <article
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={[
                                  `group rounded-lg border-2 border-l-4 border-[#172033] bg-white p-4 shadow-[3px_3px_0_#172033] outline-none transition ${column.cardAccentClassName}`,
                                  "hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#172033]",
                                  "focus-visible:ring-2 focus-visible:ring-[#3157d5] focus-visible:ring-offset-2",
                                  dragSnapshot.isDragging
                                    ? "rotate-[1deg] border-blue-300 shadow-xl ring-2 ring-blue-200"
                                    : "",
                                  isSaving || isTailoring
                                    ? "cursor-wait opacity-70"
                                    : "cursor-grab",
                                ].join(" ")}
                                aria-label={`${job.title} at ${job.company}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span
                                      aria-hidden="true"
                                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${column.avatarClassName}`}
                                    >
                                      {job.company.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                      <h3 className="truncate text-[15px] font-black text-[#172033]">
                                        {job.title}
                                      </h3>
                                      <p className="mt-0.5 truncate text-sm text-slate-600">
                                        {job.company}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${atsBadge.className}`}
                                  >
                                    {atsBadge.label}
                                  </span>
                                </div>

                                {job.categoryName ? (
                                  <div className="mt-3">
                                    <span className="inline-flex max-w-full items-center rounded-full border border-[#172033] bg-[#eef2ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#3157d5]">
                                      <span className="truncate">{job.categoryName}</span>
                                    </span>
                                  </div>
                                ) : null}

                                {job.location || job.workArrangement !== "Unspecified" || job.salaryRange ? (
                                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-bold text-[#5f6675]">
                                    {job.location ? <span className="rounded bg-[#f0efe9] px-2 py-1">{job.location}</span> : null}
                                    {job.workArrangement !== "Unspecified" ? <span className="rounded bg-[#f0efe9] px-2 py-1">{workArrangementLabel(job.workArrangement)}</span> : null}
                                    {job.salaryRange ? <span className="max-w-full truncate rounded bg-[#fff4cb] px-2 py-1" title={job.salaryRange}>{job.salaryRange}</span> : null}
                                  </div>
                                ) : null}

                                {job.missingKeywords.length > 0 ? (
                                  <p
                                    className="mt-3 line-clamp-2 text-[11px] leading-4 text-slate-500"
                                    title={job.missingKeywords.join(", ")}
                                  >
                                    <span className="font-semibold text-slate-600">
                                      Missing:
                                    </span>{" "}
                                    {job.missingKeywords.slice(0, 3).join(", ")}
                                    {job.missingKeywords.length > 3 ? "…" : ""}
                                  </p>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => void openDetails(job)}
                                  className="mt-3 w-full rounded-md border-2 border-[#172033] bg-[#eef2ff] px-3 py-2 text-xs font-black text-[#3157d5] transition hover:bg-[#ffcc4d] hover:text-[#172033] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3157d5]"
                                >
                                  View application details
                                </button>

                                <div className="mt-4 flex items-center justify-between gap-3 border-t-2 border-[#e5e3dc] pt-3">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Applied
                                    </p>
                                    <time
                                      className="text-xs font-medium text-slate-600"
                                      dateTime={job.appliedDate}
                                    >
                                      {formatAppliedDate(job.appliedDate)}
                                    </time>
                                  </div>

                                  {pdfUrl ? (
                                    <div className="flex items-center gap-1.5">
                                      <a
                                        href={pdfUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-md border-2 border-[#172033] bg-white px-2.5 py-2 text-xs font-bold text-[#172033] transition hover:bg-[#eef1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3157d5] focus-visible:ring-offset-2"
                                      >
                                        <PdfIcon />
                                        View PDF
                                      </a>
                                      {onGenerateTailoredCv ? (
                                        <button
                                          type="button"
                                          disabled={isTailoring}
                                          onClick={() =>
                                            void generateTailoredCv(job)
                                          }
                                          title="Generate a new optimized version"
                                          aria-label={`Re-tailor CV for ${job.title}`}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-[#172033] bg-white text-[#172033] transition hover:bg-[#ffcc4d] disabled:cursor-wait disabled:opacity-60"
                                        >
                                          <RefreshIcon />
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : onGenerateTailoredCv ? (
                                    <button
                                      type="button"
                                      disabled={isTailoring}
                                      onClick={() => void generateTailoredCv(job)}
                                      className="inline-flex items-center gap-1.5 rounded-md border-2 border-[#172033] bg-[#3157d5] px-2.5 py-2 text-xs font-bold text-white transition hover:bg-[#2448bb] disabled:cursor-wait disabled:opacity-60"
                                    >
                                      <PdfIcon />
                                      {isTailoring ? "Tailoring…" : "Tailor CV"}
                                    </button>
                                  ) : (
                                    <span className="text-xs font-medium text-slate-400">
                                      No tailored PDF
                                    </span>
                                  )}
                                </div>

                                {isSaving || isTailoring ? (
                                  <p
                                    aria-live="polite"
                                    className="mt-2 text-right text-[11px] font-medium text-slate-500"
                                  >
                                    {isTailoring
                                      ? "Generating ATS-matched CV…"
                                      : "Saving status…"}
                                  </p>
                                ) : null}
                              </article>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}

                      {jobs.length === 0 && !snapshot.isDraggingOver ? (
                        <div className={`flex min-h-28 items-center justify-center rounded-md border-2 border-dashed px-4 text-center text-xs font-bold ${column.emptyClassName}`}>
                          Drag a job application here
                        </div>
                      ) : null}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {selectedJob ? (
        <ApplicationDetailsModal
          job={selectedJob}
          applicationPackage={applicationPackage}
          isLoading={isLoadingDetails}
          error={detailsError}
          apiBaseUrl={apiBaseUrl}
          isDeleting={deletingJobIds.has(selectedJob.id)}
          onSaveDetails={saveApplicationDetails}
          onSaveDescription={saveApplicationDescription}
          onSaveInterviewAnswers={saveLoggedInterviewAnswers}
          onDelete={() => void deleteApplication(selectedJob)}
          onClose={closeDetails}
        />
      ) : null}

      {toast ? (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-red-200 bg-white p-4 text-sm text-slate-700 shadow-xl"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 font-bold text-red-700"
          >
            !
          </span>
          <p className="flex-1 leading-5">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Dismiss notification"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default JobKanbanBoard;
