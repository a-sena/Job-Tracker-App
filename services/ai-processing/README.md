# AI Processing Service

FastAPI service that extracts structured vacancy data from public job-posting
URLs, tailors a structured Master CV with `gpt-4o-mini`, validates the model's
indexed JSON response, merges it with immutable source metadata, and renders a
downloadable PDF with WeasyPrint.

## Files

```text
services/ai-processing/
├── app/
│   ├── __init__.py
│   └── main.py
├── tests/test_main.py
├── .env.example
├── Dockerfile
├── requirements.txt
└── requirements-dev.txt
```

## Local setup

Python 3.11 and WeasyPrint's native runtime dependencies must be installed.
From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

On Windows, WeasyPrint also requires Pango. Install MSYS2 and the UCRT64 Pango
package, then make its DLL directory available to new processes:

```powershell
winget install --exact --id MSYS2.MSYS2 --source winget
& "C:\msys64\usr\bin\bash.exe" -lc "pacman -S --needed --noconfirm mingw-w64-ucrt-x86_64-pango"
[Environment]::SetEnvironmentVariable(
  "WEASYPRINT_DLL_DIRECTORIES",
  "C:\msys64\ucrt64\bin",
  "User"
)
```

Close and reopen PowerShell after setting the user environment variable.

Set `OPENAI_API_KEY` in `.env`, then run:

```powershell
uvicorn app.main:app --reload --port 8000
```

Alternatively, use the included Dockerfile, which installs the required Linux
font and Pango packages:

```powershell
docker build -t job-tracker-ai .
docker run --rm -p 8000:8000 -e OPENAI_API_KEY="<key>" job-tracker-ai
```

Do not commit `.env` or put the API key in request payloads.

## PDF Master CV import

```http
POST /api/extract-master-cv
Content-Type: multipart/form-data
```

The `file` field accepts a text-based, non-encrypted PDF. Uploads are limited to
8 MB, 30 pages, and 100,000 extracted characters. The service validates the PDF
signature, extracts text locally with `pypdf`, and uses Pydantic-backed Structured
Outputs to enforce the CV schema while extracting only facts present in the
source. Scanned image-only PDFs are not accepted until an OCR pipeline is added.

## Vacancy extraction

```http
POST /api/extract-job
Content-Type: application/json

{ "jobUrl": "https://company.example/jobs/backend-engineer" }
```

The extractor prioritizes schema.org `JobPosting` JSON-LD and then uses
conservative HTML metadata fallbacks. Redirect targets are revalidated, private
and loopback addresses are blocked, only HTML is accepted, and response size is
bounded. Some JavaScript-only or bot-protected sites cannot be extracted; the
frontend provides a manual review fallback.

## Tailored CV request

```http
POST /api/generate-tailored-cv
Content-Type: application/json
```

```json
{
  "MasterCV": {
    "full_name": "Ada Lovelace",
    "professional_summary": "Backend engineer building reliable APIs.",
    "email": "ada@example.no",
    "phone": "+47 999 99 999",
    "location": "Oslo, Norway",
    "linkedin": "https://www.linkedin.com/in/example",
    "website": null,
    "skills": ["C#", ".NET", "PostgreSQL", "REST APIs"],
    "work_experience": [
      {
        "company": "Example AS",
        "job_title": "Software Engineer",
        "start_date": "2022",
        "end_date": "Present",
        "location": "Oslo",
        "bullet_points": [
          "Built REST APIs in C#.",
          "Improved PostgreSQL query performance."
        ]
      }
    ],
    "education": [
      {
        "institution": "Example University",
        "qualification": "BSc Computer Science",
        "start_date": "2018",
        "end_date": "2021",
        "location": "Oslo",
        "details": []
      }
    ],
    "certifications": [],
    "languages": ["Norwegian", "English"]
  },
  "JobDescription": "Seeking a backend engineer with C#, .NET, PostgreSQL and API experience."
}
```

A successful response has `Content-Type: application/pdf` and
`Content-Disposition: attachment`.

The .NET service uses `POST /api/tailored-cv-package` internally. It returns the
same validated document and PDF together with the ATS score, keyword evidence,
safe filename, and base64-encoded PDF bytes so one AI result can be persisted
without regeneration. Browser clients should use the .NET download endpoint
instead of calling this internal endpoint directly.

## Guardrail boundary

The model is allowed to produce only:

- a rewritten professional summary;
- one indexed rewrite for every existing source work-history bullet;
- matched and unsupported keywords;
- an evidence-based ATS score.

When the first grounded result scores below
`OPENAI_ATS_REFINEMENT_THRESHOLD` (default `75`), the service performs one bounded
refinement pass. The second result is accepted only when it preserves the exact
matched/missing keyword classification, keeps every source bullet mapping valid,
does not reduce exact supported-keyword coverage, and improves the score. Set the
threshold to `0` to disable this extra API call.

Company names, titles, dates, contact details, skills, education, certifications,
and languages are always copied from the Master CV. Output with missing, duplicate,
or additional experience or bullet indices is rejected with HTTP `502`.

The prompt is a behavioral guardrail, not a mathematical proof of semantic
faithfulness. For high-assurance production use, retain the original and tailored
texts for user review and require explicit approval before storing or distributing
the generated CV.

## Tests

```powershell
pytest
```
