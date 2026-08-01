import { useEffect, useState } from "react";

export interface WorkExperience {
  company: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  location: string | null;
  bulletPoints: string[];
}

export interface Education {
  institution: string;
  qualification: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  details: string[];
}

export interface Project {
  name: string;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  url: string | null;
  technologies: string[];
  bulletPoints: string[];
}

export interface Course {
  name: string;
  provider: string | null;
  completedDate: string | null;
  details: string[];
}

export interface MasterCvContent {
  fullName: string;
  headline: string | null;
  professionalSummary: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  website: string | null;
  skills: string[];
  workExperience: WorkExperience[];
  projects: Project[];
  education: Education[];
  certifications: string[];
  courses: Course[];
  languages: string[];
}

export interface MasterCv {
  id: string;
  userId: string;
  name: string;
  content: MasterCvContent;
  createdAt: string;
  updatedAt: string;
}

interface MasterCvEditorProps {
  userId: string;
  apiBaseUrl?: string;
  initialMasterCv: MasterCv | null;
  onSaved: (masterCv: MasterCv) => void;
  onClose: () => void;
}

interface ProblemDetails {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

interface ImportedMasterCv {
  content: MasterCvContent;
  warnings: string[];
  sourceFileName: string;
}

const EMPTY_CONTENT: MasterCvContent = {
  fullName: "",
  headline: null,
  professionalSummary: "",
  email: null,
  phone: null,
  location: null,
  linkedin: null,
  website: null,
  skills: [],
  workExperience: [],
  projects: [],
  education: [],
  certifications: [],
  courses: [],
  languages: [],
};

const EMPTY_EXPERIENCE: WorkExperience = {
  company: "",
  jobTitle: "",
  startDate: "",
  endDate: "",
  location: null,
  bulletPoints: [""],
};

const EMPTY_EDUCATION: Education = {
  institution: "",
  qualification: "",
  startDate: null,
  endDate: null,
  location: null,
  details: [],
};

const EMPTY_PROJECT: Project = {
  name: "",
  role: null,
  startDate: null,
  endDate: null,
  url: null,
  technologies: [],
  bulletPoints: [],
};

const EMPTY_COURSE: Course = {
  name: "",
  provider: null,
  completedDate: null,
  details: [],
};

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function normalizeImportedContent(value: unknown): MasterCvContent {
  if (!value || typeof value !== "object") {
    throw new Error("The JSON file must contain a CV object.");
  }

  const content = value as Partial<MasterCvContent>;
  if (
    typeof content.fullName !== "string" ||
    typeof content.professionalSummary !== "string"
  ) {
    throw new Error(
      "The JSON file must include fullName and professionalSummary.",
    );
  }

  return {
    ...EMPTY_CONTENT,
    ...content,
    skills: Array.isArray(content.skills) ? content.skills : [],
    workExperience: Array.isArray(content.workExperience)
      ? content.workExperience
      : [],
    projects: Array.isArray(content.projects) ? content.projects : [],
    education: Array.isArray(content.education) ? content.education : [],
    certifications: Array.isArray(content.certifications)
      ? content.certifications
      : [],
    courses: Array.isArray(content.courses) ? content.courses : [],
    languages: Array.isArray(content.languages) ? content.languages : [],
  };
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}

const inputClassName =
  "h-11 rounded-md border-2 border-[#9ca1ad] bg-white px-3 font-normal text-[#172033] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dbe3ff]";
const textareaClassName =
  "resize-y rounded-md border-2 border-[#9ca1ad] bg-white px-3 py-2.5 font-normal leading-6 text-[#172033] outline-none transition focus:border-[#3157d5] focus:ring-2 focus:ring-[#dbe3ff]";

export default function MasterCvEditor({
  userId,
  apiBaseUrl = "",
  initialMasterCv,
  onSaved,
  onClose,
}: MasterCvEditorProps): JSX.Element {
  const [name, setName] = useState("Master CV");
  const [content, setContent] = useState<MasterCvContent>(EMPTY_CONTENT);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (initialMasterCv) {
      setName(initialMasterCv.name);
      setContent(initialMasterCv.content);
    }
  }, [initialMasterCv]);

  function updateContent<K extends keyof MasterCvContent>(
    field: K,
    value: MasterCvContent[K],
  ): void {
    setContent((current) => ({ ...current, [field]: value }));
  }

  function updateExperience(
    index: number,
    patch: Partial<WorkExperience>,
  ): void {
    updateContent(
      "workExperience",
      content.workExperience.map((experience, experienceIndex) =>
        experienceIndex === index ? { ...experience, ...patch } : experience,
      ),
    );
  }

  function updateEducation(index: number, patch: Partial<Education>): void {
    updateContent(
      "education",
      content.education.map((education, educationIndex) =>
        educationIndex === index ? { ...education, ...patch } : education,
      ),
    );
  }

  function updateProject(index: number, patch: Partial<Project>): void {
    updateContent(
      "projects",
      content.projects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, ...patch } : project,
      ),
    );
  }

  function updateCourse(index: number, patch: Partial<Course>): void {
    updateContent(
      "courses",
      content.courses.map((course, courseIndex) =>
        courseIndex === index ? { ...course, ...patch } : course,
      ),
    );
  }

  async function importJson(file: File): Promise<void> {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported =
        parsed && typeof parsed === "object" && "content" in parsed
          ? (parsed as { content: unknown }).content
          : parsed;
      setContent(normalizeImportedContent(imported));
      setImportWarnings([
        "Review every imported field before saving the Master CV.",
      ]);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "The CV JSON file could not be read.",
      );
    }
  }

  async function importPdf(file: File): Promise<void> {
    setError(null);
    setImportWarnings([]);

    if (file.size === 0 || file.size > 8_000_000) {
      setError("Choose a non-empty PDF smaller than 8 MB.");
      return;
    }

    if (
      file.type &&
      !["application/pdf", "application/x-pdf"].includes(file.type)
    ) {
      setError("Choose a PDF file.");
      return;
    }

    setIsImportingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/api/master-cvs/import-pdf`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
          body: formData,
        },
      );

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as
          | ProblemDetails
          | null;
        throw new Error(
          problem?.detail ||
            problem?.title ||
            `PDF import failed (${response.status}).`,
        );
      }

      const imported = (await response.json()) as ImportedMasterCv;
      setContent(normalizeImportedContent(imported.content));
      setName(file.name.replace(/\.pdf$/i, "").trim() || "Master CV");
      setImportWarnings(imported.warnings);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "The PDF CV could not be imported.",
      );
    } finally {
      setIsImportingPdf(false);
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/api/master-cvs/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: name.trim(), content }),
        },
      );

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as
          | ProblemDetails
          | null;
        const validationMessage = problem?.errors
          ? Object.values(problem.errors).flat()[0]
          : null;
        throw new Error(
          validationMessage ||
            problem?.detail ||
            problem?.title ||
            `Saving failed (${response.status}).`,
        );
      }

      onSaved((await response.json()) as MasterCv);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The Master CV could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border-2 border-[#172033] bg-white shadow-[5px_5px_0_#172033]">
      <div className="flex flex-col justify-between gap-4 border-b-2 border-[#172033] bg-[#3157d5] p-5 text-white sm:flex-row sm:items-start sm:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffcc4d]">
            Factual source
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Master CV workspace
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#e3e9ff]">
            Only information saved here may appear in tailored CVs. The AI can
            rephrase and prioritize these facts, but cannot add employers,
            experience, or tools you did not provide.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <label
            className={[
              "rounded-md border-2 border-[#172033] bg-[#ff7058] px-3 py-2 text-sm font-black text-[#172033] shadow-[3px_3px_0_#172033] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#172033]",
              isImportingPdf
                ? "cursor-wait opacity-60"
                : "cursor-pointer",
            ].join(" ")}
          >
            {isImportingPdf ? "Reading PDF…" : "Import PDF"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              disabled={isImportingPdf}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importPdf(file);
                event.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-sm font-bold text-[#172033] transition hover:bg-[#ffcc4d]">
            Import JSON
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importJson(file);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15"
          >
            Close
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-7 p-5 sm:p-7">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        {importWarnings.length > 0 ? (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-3 text-sm text-yellow-900">
            <p className="font-semibold">PDF import requires your review</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {importWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-b-2 border-[#172033] pb-3">
          <span className="bg-[#ffcc4d] px-2 py-1 text-xs font-black text-[#172033]">
            01
          </span>
          <h3 className="text-lg font-black uppercase tracking-[0.08em] text-[#172033]">
            Profile
          </h3>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <FieldLabel label="CV name">
            <input
              required
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClassName}
            />
          </FieldLabel>
          <FieldLabel label="Full name">
            <input
              required
              maxLength={200}
              value={content.fullName}
              onChange={(event) => updateContent("fullName", event.target.value)}
              className={inputClassName}
            />
          </FieldLabel>
          <FieldLabel label="Professional headline">
            <input
              maxLength={200}
              value={content.headline ?? ""}
              onChange={(event) =>
                updateContent("headline", optional(event.target.value))
              }
              placeholder="e.g. Product Designer (UX/UI)"
              className={inputClassName}
            />
          </FieldLabel>
          <FieldLabel label="Email">
            <input
              type="email"
              maxLength={320}
              value={content.email ?? ""}
              onChange={(event) => updateContent("email", optional(event.target.value))}
              className={inputClassName}
            />
          </FieldLabel>
          <FieldLabel label="Phone">
            <input
              maxLength={100}
              value={content.phone ?? ""}
              onChange={(event) => updateContent("phone", optional(event.target.value))}
              className={inputClassName}
            />
          </FieldLabel>
          <FieldLabel label="Location">
            <input
              maxLength={200}
              value={content.location ?? ""}
              onChange={(event) =>
                updateContent("location", optional(event.target.value))
              }
              className={inputClassName}
            />
          </FieldLabel>
          <FieldLabel label="LinkedIn URL">
            <input
              type="url"
              maxLength={500}
              value={content.linkedin ?? ""}
              onChange={(event) =>
                updateContent("linkedin", optional(event.target.value))
              }
              className={inputClassName}
            />
          </FieldLabel>
        </div>

        <FieldLabel label="Professional summary">
          <textarea
            required
            minLength={20}
            maxLength={5_000}
            rows={5}
            value={content.professionalSummary}
            onChange={(event) =>
              updateContent("professionalSummary", event.target.value)
            }
            className={textareaClassName}
          />
        </FieldLabel>

        <div className="grid gap-5 md:grid-cols-2">
          <FieldLabel label="Skills (comma separated)">
            <textarea
              rows={3}
              value={content.skills.join(", ")}
              onChange={(event) =>
                updateContent("skills", splitCommaSeparated(event.target.value))
              }
              className={textareaClassName}
            />
          </FieldLabel>
          <FieldLabel label="Languages (comma separated)">
            <textarea
              rows={3}
              value={content.languages.join(", ")}
              onChange={(event) =>
                updateContent("languages", splitCommaSeparated(event.target.value))
              }
              className={textareaClassName}
            />
          </FieldLabel>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black uppercase tracking-[0.06em] text-[#172033]">
              <span className="mr-2 text-[#3157d5]">02</span>
              Selected projects
            </h3>
            <button
              type="button"
              onClick={() =>
                updateContent("projects", [
                  ...content.projects,
                  { ...EMPTY_PROJECT, technologies: [], bulletPoints: [] },
                ])
              }
              className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-sm font-bold shadow-[2px_2px_0_#172033]"
            >
              Add project
            </button>
          </div>
          <div className="mt-4 grid gap-4">
            {content.projects.map((project, index) => (
              <div
                key={index}
                className="grid gap-4 rounded-md border-2 border-l-[6px] border-[#172033] border-l-[#3157d5] bg-[#f7f7f4] p-4"
              >
                <div className="flex justify-between">
                  <p className="text-sm font-bold">Project {index + 1}</p>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent(
                        "projects",
                        content.projects.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    className="text-xs font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldLabel label="Project name">
                    <input
                      required
                      value={project.name}
                      onChange={(event) => updateProject(index, { name: event.target.value })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Your role">
                    <input
                      value={project.role ?? ""}
                      onChange={(event) => updateProject(index, { role: optional(event.target.value) })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Technologies (comma separated)">
                    <input
                      value={project.technologies.join(", ")}
                      onChange={(event) => updateProject(index, { technologies: splitCommaSeparated(event.target.value) })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Project URL">
                    <input
                      type="url"
                      value={project.url ?? ""}
                      onChange={(event) => updateProject(index, { url: optional(event.target.value) })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                </div>
                <FieldLabel label="Project details (one per line)">
                  <textarea
                    rows={4}
                    value={project.bulletPoints.join("\n")}
                    onChange={(event) => updateProject(index, { bulletPoints: splitLines(event.target.value) })}
                    className={textareaClassName}
                  />
                </FieldLabel>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black uppercase tracking-[0.06em] text-[#172033]">
              <span className="mr-2 text-[#3157d5]">03</span>
              Work experience
            </h3>
            <button
              type="button"
              onClick={() =>
                updateContent("workExperience", [
                  ...content.workExperience,
                  { ...EMPTY_EXPERIENCE, bulletPoints: [""] },
                ])
              }
              className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-sm font-bold text-[#172033] shadow-[2px_2px_0_#172033] transition hover:bg-[#e8edff]"
            >
              Add experience
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {content.workExperience.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                Add your real work history. Tailoring will never create missing
                experience.
              </p>
            ) : null}
            {content.workExperience.map((experience, index) => (
              <div
                key={index}
                className="grid gap-4 rounded-md border-2 border-l-[6px] border-[#172033] border-l-[#3157d5] bg-[#f7f7f4] p-4"
              >
                <div className="flex justify-between">
                  <p className="text-sm font-bold text-slate-700">
                    Experience {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent(
                        "workExperience",
                        content.workExperience.filter(
                          (_, experienceIndex) => experienceIndex !== index,
                        ),
                      )
                    }
                    className="text-xs font-semibold text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldLabel label="Company">
                    <input
                      required
                      value={experience.company}
                      onChange={(event) =>
                        updateExperience(index, { company: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Job title">
                    <input
                      required
                      value={experience.jobTitle}
                      onChange={(event) =>
                        updateExperience(index, { jobTitle: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Start date">
                    <input
                      required
                      value={experience.startDate}
                      onChange={(event) =>
                        updateExperience(index, { startDate: event.target.value })
                      }
                      placeholder="2022"
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="End date">
                    <input
                      required
                      value={experience.endDate}
                      onChange={(event) =>
                        updateExperience(index, { endDate: event.target.value })
                      }
                      placeholder="Present"
                      className={inputClassName}
                    />
                  </FieldLabel>
                </div>
                <FieldLabel label="Bullet points (one per line)">
                  <textarea
                    required
                    rows={5}
                    value={experience.bulletPoints.join("\n")}
                    onChange={(event) =>
                      updateExperience(index, {
                        bulletPoints: splitLines(event.target.value),
                      })
                    }
                    className={textareaClassName}
                  />
                </FieldLabel>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black uppercase tracking-[0.06em] text-[#172033]">
              <span className="mr-2 text-[#d84d3d]">04</span>
              Education
            </h3>
            <button
              type="button"
              onClick={() =>
                updateContent("education", [
                  ...content.education,
                  { ...EMPTY_EDUCATION, details: [] },
                ])
              }
              className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-sm font-bold text-[#172033] shadow-[2px_2px_0_#172033] transition hover:bg-[#fff4d1]"
            >
              Add education
            </button>
          </div>
          <div className="mt-4 grid gap-4">
            {content.education.map((education, index) => (
              <div
                key={index}
                className="grid gap-4 rounded-md border-2 border-l-[6px] border-[#172033] border-l-[#ff7058] bg-[#f7f7f4] p-4"
              >
                <div className="flex justify-between">
                  <p className="text-sm font-bold text-slate-700">
                    Education {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent(
                        "education",
                        content.education.filter(
                          (_, educationIndex) => educationIndex !== index,
                        ),
                      )
                    }
                    className="text-xs font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldLabel label="Institution">
                    <input
                      required
                      value={education.institution}
                      onChange={(event) =>
                        updateEducation(index, {
                          institution: event.target.value,
                        })
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Qualification">
                    <input
                      required
                      value={education.qualification}
                      onChange={(event) =>
                        updateEducation(index, {
                          qualification: event.target.value,
                        })
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Start date">
                    <input
                      value={education.startDate ?? ""}
                      onChange={(event) =>
                        updateEducation(index, {
                          startDate: optional(event.target.value),
                        })
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="End date">
                    <input
                      value={education.endDate ?? ""}
                      onChange={(event) =>
                        updateEducation(index, {
                          endDate: optional(event.target.value),
                        })
                      }
                      className={inputClassName}
                    />
                  </FieldLabel>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black uppercase tracking-[0.06em] text-[#172033]">
              <span className="mr-2 text-[#3157d5]">05</span>
              Courses and training
            </h3>
            <button
              type="button"
              onClick={() =>
                updateContent("courses", [
                  ...content.courses,
                  { ...EMPTY_COURSE, details: [] },
                ])
              }
              className="rounded-md border-2 border-[#172033] bg-white px-3 py-2 text-sm font-bold shadow-[2px_2px_0_#172033]"
            >
              Add course
            </button>
          </div>
          <div className="mt-4 grid gap-4">
            {content.courses.map((course, index) => (
              <div
                key={index}
                className="grid gap-4 rounded-md border-2 border-l-[6px] border-[#172033] border-l-[#ffcc4d] bg-[#f7f7f4] p-4"
              >
                <div className="flex justify-between">
                  <p className="text-sm font-bold">Course {index + 1}</p>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent(
                        "courses",
                        content.courses.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    className="text-xs font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <FieldLabel label="Course name">
                    <input
                      required
                      value={course.name}
                      onChange={(event) => updateCourse(index, { name: event.target.value })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Provider">
                    <input
                      value={course.provider ?? ""}
                      onChange={(event) => updateCourse(index, { provider: optional(event.target.value) })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                  <FieldLabel label="Completed">
                    <input
                      value={course.completedDate ?? ""}
                      onChange={(event) => updateCourse(index, { completedDate: optional(event.target.value) })}
                      className={inputClassName}
                    />
                  </FieldLabel>
                </div>
                <FieldLabel label="Details (one per line)">
                  <textarea
                    rows={3}
                    value={course.details.join("\n")}
                    onChange={(event) => updateCourse(index, { details: splitLines(event.target.value) })}
                    className={textareaClassName}
                  />
                </FieldLabel>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <FieldLabel label="Certifications (one per line)">
            <textarea
              rows={3}
              value={content.certifications.join("\n")}
              onChange={(event) =>
                updateContent("certifications", splitLines(event.target.value))
              }
              className={textareaClassName}
            />
          </FieldLabel>
          <FieldLabel label="Portfolio or website URL">
            <input
              type="url"
              maxLength={500}
              value={content.website ?? ""}
              onChange={(event) =>
                updateContent("website", optional(event.target.value))
              }
              className={inputClassName}
            />
          </FieldLabel>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-5">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-md border-2 border-[#172033] bg-[#3157d5] px-6 text-sm font-black text-white shadow-[3px_3px_0_#172033] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#172033] disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save Master CV"}
          </button>
        </div>
      </form>
    </section>
  );
}
