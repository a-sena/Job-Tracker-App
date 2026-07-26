import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { format, isValid, parseISO } from "date-fns";
import { nb } from "date-fns/locale";
import { useCallback, useEffect, useRef, useState } from "react";

export const JOB_STATUSES = [
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobApplication {
  id: string;
  title: string;
  company: string;
  appliedDate: string;
  atsMatchScore: number | null;
  tailoredPdfUrl?: string | null;
  status: JobStatus;
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
}

type JobsByStatus = Record<JobStatus, JobApplication[]>;

interface ColumnStyle {
  title: string;
  headerClassName: string;
  dotClassName: string;
  countClassName: string;
  dropRingClassName: string;
}

interface ToastMessage {
  id: number;
  message: string;
}

const COLUMN_STYLES: Record<JobStatus, ColumnStyle> = {
  Applied: {
    title: "Applied",
    headerClassName: "border-blue-200 bg-blue-50 text-blue-900",
    dotClassName: "bg-blue-500",
    countClassName: "bg-blue-100 text-blue-700",
    dropRingClassName: "border-blue-300 bg-blue-50/70 ring-blue-200",
  },
  Interviewing: {
    title: "Interviewing",
    headerClassName: "border-yellow-200 bg-yellow-50 text-yellow-900",
    dotClassName: "bg-yellow-500",
    countClassName: "bg-yellow-100 text-yellow-800",
    dropRingClassName: "border-yellow-300 bg-yellow-50/70 ring-yellow-200",
  },
  Offer: {
    title: "Offer",
    headerClassName: "border-green-200 bg-green-50 text-green-900",
    dotClassName: "bg-green-500",
    countClassName: "bg-green-100 text-green-700",
    dropRingClassName: "border-green-300 bg-green-50/70 ring-green-200",
  },
  Rejected: {
    title: "Rejected",
    headerClassName: "border-red-200 bg-red-50 text-red-900",
    dotClassName: "bg-red-500",
    countClassName: "bg-red-100 text-red-700",
    dropRingClassName: "border-red-300 bg-red-50/70 ring-red-200",
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

export function JobKanbanBoard({
  initialJobs,
  apiBaseUrl = "",
  onStatusChangeConfirmed,
}: JobKanbanBoardProps): JSX.Element {
  const [jobsByStatus, setJobsByStatus] = useState<JobsByStatus>(() =>
    createBoard(initialJobs),
  );
  const [pendingJobIds, setPendingJobIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
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
        const response = await fetch(
          joinApiUrl(
            apiBaseUrl,
            `/api/jobs/${encodeURIComponent(jobId)}/status`,
          ),
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
                className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm"
              >
                <header
                  className={`flex items-center justify-between border-b px-4 py-3 ${column.headerClassName}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${column.dotClassName}`}
                    />
                    <h2 className="text-sm font-semibold">{column.title}</h2>
                  </div>
                  <span
                    aria-label={`${jobs.length} jobs`}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${column.countClassName}`}
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
                        const pdfUrl = isSafePdfUrl(job.tailoredPdfUrl)
                          ? job.tailoredPdfUrl
                          : null;

                        return (
                          <Draggable
                            key={job.id}
                            draggableId={job.id}
                            index={index}
                            isDragDisabled={isSaving}
                          >
                            {(dragProvided, dragSnapshot) => (
                              <article
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={[
                                  "group rounded-lg border border-slate-200 bg-white p-4 shadow-sm outline-none transition",
                                  "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
                                  "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                                  dragSnapshot.isDragging
                                    ? "rotate-[1deg] border-blue-300 shadow-xl ring-2 ring-blue-200"
                                    : "",
                                  isSaving ? "cursor-wait opacity-70" : "cursor-grab",
                                ].join(" ")}
                                aria-label={`${job.title} at ${job.company}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold text-slate-950">
                                      {job.title}
                                    </h3>
                                    <p className="mt-0.5 truncate text-sm text-slate-600">
                                      {job.company}
                                    </p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${atsBadge.className}`}
                                  >
                                    {atsBadge.label}
                                  </span>
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
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
                                    <a
                                      href={pdfUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                    >
                                      <PdfIcon />
                                      View Tailored PDF
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled
                                      title="A tailored PDF has not been generated yet."
                                      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-400"
                                    >
                                      <PdfIcon />
                                      View Tailored PDF
                                    </button>
                                  )}
                                </div>

                                {isSaving ? (
                                  <p
                                    aria-live="polite"
                                    className="mt-2 text-right text-[11px] font-medium text-slate-500"
                                  >
                                    Saving status…
                                  </p>
                                ) : null}
                              </article>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}

                      {jobs.length === 0 && !snapshot.isDraggingOver ? (
                        <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/60 px-4 text-center text-xs font-medium text-slate-400">
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
