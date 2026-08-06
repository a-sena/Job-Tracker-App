# Rolevya

A full-stack job application workspace with a React Kanban board, a .NET 8 Clean
Architecture API, PostgreSQL persistence, and a FastAPI service for secure vacancy
extraction, CV tailoring, and PDF generation.

## Run the application locally

Prerequisites on this workstation are already configured:

- PostgreSQL 17 on `localhost:8080`
- .NET 8 SDK
- Node.js and npm
- Python 3.11 virtual environment in `services/ai-processing/.venv`
- WeasyPrint native libraries in `C:\msys64\ucrt64\bin`

Open three PowerShell terminals at the repository root.

Terminal 1 - AI processing and vacancy extraction:

```powershell
cd services\ai-processing
$env:WEASYPRINT_DLL_DIRECTORIES = "C:\msys64\ucrt64\bin"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 - .NET API:

```powershell
dotnet run --project src\JobTracker.Api --launch-profile http
```

Terminal 3 - React frontend:

```powershell
cd frontend
npm.cmd run dev
```

Open `http://localhost:5173`. The Application Studio guides one refresh-safe draft
through four stages: select a saved CV and vacancy, review the original ATS match,
generate a truth-grounded tailored CV, and prepare first-round interview questions.
The application is added to the separate Kanban log only after the user chooses an
existing or new category. Tailored CVs and interview questions are downloadable as
PDFs. Unsupported requirements remain visible instead of being fabricated.

Create an account from the first screen using an email address and password. Existing
CVs and applications stored by the former local-workspace version are transferred to
the new account during registration. Authentication uses ASP.NET Core Identity and an
HttpOnly session cookie; passwords are hashed by Identity and are never stored in the
browser. Restart the API after pulling authentication changes so the new endpoints and
cookie configuration are loaded.

The profile menu also contains a Membership dashboard. Free accounts receive one
lifetime CV review, one AI-tailored CV, one interview preparation set, and one cover
letter; manual application tracking remains unlimited. Successful generations consume
an allowance, while failed AI requests release it. The Founding Member offer is shown
at $8 USD per month or $80 USD per year with 40 monthly AI actions. Planned
regular prices are $10 USD per month and $100 USD per year.
Checkout is enabled only when all Stripe settings are present. Stripe-hosted Checkout
collects the payment details; Rolevya never receives or stores full card numbers.

The FastAPI service requires a local
`services/ai-processing/.env` containing `OPENAI_API_KEY` before it starts.
The key is used for PDF CV structuring, ATS review, tailoring, and interview
questions. Vacancy webpage extraction itself does not call OpenAI.

## Project structure

```text
Job-Tracker-App/
├── Directory.Build.props
├── Directory.Packages.props
├── global.json
├── JobTracker.sln
├── frontend/
│   ├── src/App.tsx
│   ├── src/components/application/ApplicationWorkflow.tsx
│   ├── src/components/jobs/JobKanbanBoard.tsx
│   ├── package.json
│   └── tsconfig.json
├── services/
│   └── ai-processing/
│       ├── app/main.py
│       ├── tests/test_main.py
│       ├── Dockerfile
│       └── requirements.txt
└── src/
    ├── JobTracker.Domain/
    │   ├── Entities/
    │   │   ├── ApplicationCategory.cs
    │   │   ├── ApplicationDraft.cs
    │   │   ├── JobApplication.cs
    │   │   ├── MasterCv.cs
    │   │   └── TailoredCv.cs
    │   └── Enums/JobApplicationStatus.cs
    ├── JobTracker.Application/
    │   ├── Abstractions/Persistence/IJobApplicationRepository.cs
    │   ├── Jobs/
    │   │   ├── Dtos/
    │   │   ├── Mappings/
    │   │   ├── IJobApplicationService.cs
    │   │   └── JobApplicationService.cs
    │   └── DependencyInjection.cs
    ├── JobTracker.Infrastructure/
    │   ├── Persistence/
    │   │   ├── Configurations/
    │   │   ├── Repositories/
    │   │   └── JobTrackerDbContext.cs
    │   └── DependencyInjection.cs
    └── JobTracker.Api/
        ├── Controllers/JobsController.cs
        ├── Program.cs
        └── appsettings.json
```

`MasterCv` and `TailoredCv` use standard .NET initialism casing while mapping to
the PostgreSQL tables `master_cvs` and `tailored_cvs`.

The Python AI microservice and its `/api/generate-tailored-cv` endpoint are
documented in
[`services/ai-processing/README.md`](services/ai-processing/README.md).

The React drag-and-drop jobs board is documented in
[`frontend/README.md`](frontend/README.md).

## Dependency direction

```text
API ──> Application ──> Domain
 │            ▲
 └──> Infrastructure
```

- **Domain** contains entities, invariants, and the Kanban status enum.
- **Application** contains DTOs, mappings, service orchestration, and persistence
  abstractions.
- **Infrastructure** implements persistence with EF Core and PostgreSQL.
- **API** handles HTTP, model validation, JSON serialization, and composition.

## PostgreSQL configuration

The development connection string in `appsettings.json` is a local-only default.
For real environments, inject it through a secret store or an environment
variable:

```powershell
$env:ConnectionStrings__JobTrackerDatabase = "Host=localhost;Port=5432;Database=job_tracker;Username=job_tracker;Password=<password>"
```

This workstation uses the development override in
`src/JobTracker.Api/appsettings.Development.json`, where PostgreSQL 17 listens on
port `8080`. The base configuration retains PostgreSQL's conventional `5432`
default for other environments.

PostgreSQL-specific mappings include:

- `timestamp with time zone` for UTC timestamps
- `numeric(5,2)` with a database check constraint for the 0–100 ATS score
- `text[]` for missing ATS keywords
- string-backed job statuses with a database check constraint

## Create the initial migration

Run these commands from the repository root:

```powershell
dotnet restore
dotnet tool install --global dotnet-ef --version 8.0.29
dotnet ef migrations add InitialCreate `
  --project src/JobTracker.Infrastructure `
  --startup-project src/JobTracker.Api `
  --output-dir Persistence/Migrations
dotnet ef database update `
  --project src/JobTracker.Infrastructure `
  --startup-project src/JobTracker.Api
```

If `dotnet-ef` is already installed, update it instead:

```powershell
dotnet tool update --global dotnet-ef --version 8.0.29
```

Commit generated migrations to source control. The production container applies
reviewed migrations at startup while holding a PostgreSQL advisory lock, preventing
two replicas from migrating the database concurrently.

## Configure Stripe subscriptions

Rolevya uses Stripe-hosted Checkout for card collection, signed webhooks for
membership activation, and the Stripe Customer Portal for cancellation and billing
management. Full card numbers never pass through the Rolevya API.

In Stripe test mode, create one product named `Rolevya Founding Member` with two
recurring USD prices:

- Monthly: `$8.00 USD`, recurring every month
- Annual: `$80.00 USD`, recurring every year

Copy the resulting `price_...` identifiers. Keep all secrets outside tracked
configuration by running these commands from the repository root:

```powershell
dotnet user-secrets set "Stripe:SecretKey" "sk_test_REPLACE_ME" --project .\src\JobTracker.Api
dotnet user-secrets set "Stripe:MonthlyPriceId" "price_REPLACE_MONTHLY" --project .\src\JobTracker.Api
dotnet user-secrets set "Stripe:AnnualPriceId" "price_REPLACE_ANNUAL" --project .\src\JobTracker.Api
```

For local webhook delivery, install and authenticate the Stripe CLI, then keep this
command running in a separate terminal:

```powershell
stripe.cmd login
stripe.cmd listen --forward-to http://localhost:5080/api/billing/webhook
```

The CLI prints a signing secret beginning with `whsec_`. Store it with:

```powershell
dotnet user-secrets set "Stripe:WebhookSecret" "whsec_REPLACE_ME" --project .\src\JobTracker.Api
```

Restart the API after changing secrets. In the Stripe Dashboard, activate the
Customer Portal and allow customers to cancel subscriptions. For production, replace
the test secret and Price IDs with live-mode values, set the three Stripe redirect
URLs to the production frontend, and register
`https://YOUR_API_DOMAIN/api/billing/webhook` for these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Production values should be supplied through environment variables such as
`Stripe__SecretKey`, `Stripe__WebhookSecret`, `Stripe__MonthlyPriceId`, and
`Stripe__AnnualPriceId`. Configure VAT/tax behaviour in Stripe with an accountant
before accepting live payments.

The complete Railway, Namecheap DNS, and production Stripe checklist is in
[`docs/deployment/railway.md`](docs/deployment/railway.md).

## Run the API

```powershell
dotnet run --project src/JobTracker.Api
```

Example requests are available in
`src/JobTracker.Api/JobTracker.Api.http`.

## Jobs endpoints

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/jobs` | All applications, most recently updated first |
| `GET` | `/api/jobs/{id}` | One application |
| `POST` | `/api/jobs/extract` | Extracts a public vacancy for review |
| `POST` | `/api/jobs` | Creates an application with `Applied` status |
| `POST` | `/api/jobs/{id}/tailored-cv` | Generates and stores a tailored CV |
| `GET` | `/api/jobs/{id}/tailored-cv` | Latest tailored CV metadata |
| `GET` | `/api/jobs/{id}/tailored-cv/pdf` | Downloads the stored PDF |
| `PUT` | `/api/jobs/{id}/status` | Updates its Kanban status |
| `DELETE` | `/api/jobs/{id}` | Deletes it and its tailored CV records |

Valid status values are `Applied`, `Interviewing`, `Offer`, and `Rejected`.

Application Studio endpoints:

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/application-workflow/draft?userId={id}` | Restores the active draft |
| `POST` | `/api/application-workflow/draft` | Gets or creates an active draft |
| `PUT` | `/api/application-workflow/draft/{id}/source` | Saves the selected CV and vacancy |
| `POST` | `/api/application-workflow/draft/{id}/review` | Reviews the original ATS match |
| `POST` | `/api/application-workflow/draft/{id}/tailor` | Generates the tailored CV |
| `POST` | `/api/application-workflow/draft/{id}/interview-questions` | Generates first-round questions |
| `POST` | `/api/application-workflow/draft/{id}/log` | Categorizes and logs the application |
| `GET` | `/api/application-categories?userId={id}` | Lists saved application categories |

Saved CV library endpoints:

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/cvs?userId={id}` | Lists saved CVs |
| `POST` | `/api/cvs/import-pdf` | Imports, structures, and stores a PDF CV |
| `PUT` | `/api/cvs/{id}` | Renames a saved CV |
| `PUT` | `/api/cvs/{id}/default` | Selects the default CV |
| `DELETE` | `/api/cvs/{id}` | Deletes a CV that is not in use |

Legacy Master CV endpoints:

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/master-cvs/{userId}` | Current factual Master CV |
| `PUT` | `/api/master-cvs/{userId}` | Creates or replaces the Master CV |
| `POST` | `/api/master-cvs/import-pdf` | Extracts editable CV fields from a PDF |

PDF imports accept non-encrypted PDF files smaller than 8 MB. Text-based PDFs use
local text extraction first; PDFs without selectable text fall back to OpenAI
visual page analysis with response storage disabled. Users can save and select
multiple CVs for different job types.

## Account endpoints

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/auth/csrf` | Issues the CSRF request token used by the React client |
| `POST` | `/api/auth/register` | Creates an Identity account and signs in |
| `POST` | `/api/auth/login` | Starts an HttpOnly cookie session |
| `GET` | `/api/auth/me` | Restores the current signed-in user |
| `POST` | `/api/auth/change-password` | Changes the authenticated user's password |
| `POST` | `/api/auth/logout` | Ends the current session |

Billing endpoints:

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/membership` | Returns the current plan and AI allowances |
| `POST` | `/api/billing/checkout` | Creates an authenticated Stripe Checkout Session |
| `POST` | `/api/billing/portal` | Creates a Stripe Customer Portal Session |
| `POST` | `/api/billing/webhook` | Verifies and applies Stripe subscription events |

All CV, application workflow, category, and job endpoints require authentication.
Although some legacy request contracts still contain `UserId`, the Application layer
verifies it against the authenticated Identity claim and scopes ID-based reads and
writes to the current account.
