# Deploy Rolevya to Railway

This deployment uses three Railway services in one project:

- `rolevya-web`: the React application and .NET API, exposed publicly
- `rolevya-ai`: the FastAPI service, reachable only through Railway private networking
- `Postgres`: the managed PostgreSQL database, reachable only through Railway private networking

The root `Dockerfile` builds React, publishes .NET, and serves both from one origin.
The AI service uses `services/ai-processing/Dockerfile`. Do not expose the AI service
or PostgreSQL with a public domain.

## 1. Create the Railway project

1. Push this repository to GitHub.
2. In Railway, create a new project and choose **Deploy from GitHub repo**.
3. Select this repository and name the service `rolevya-web`.
4. Keep its root directory as `/`. Railway will detect the root `Dockerfile`.
5. Add PostgreSQL from **New > Database > PostgreSQL**.
6. Add the same GitHub repository again as a second service named `rolevya-ai`.
7. Set the AI service root directory to `/services/ai-processing`. Railway will use
   the Dockerfile in that directory.

Do not deploy the web service until the variables below are present. The production
API deliberately refuses to start with an empty database or AI-service address.

## 2. Configure `rolevya-ai`

Add these service variables:

```text
OPENAI_API_KEY=<your OpenAI project key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=60
OPENAI_MAX_RETRIES=2
OPENAI_MAX_OUTPUT_TOKENS=8000
OPENAI_ATS_REFINEMENT_THRESHOLD=75
```

Railway supplies `PORT`; the container listens on it automatically. Set the service
health-check path to `/health`. Under **Settings > Networking**, copy its Railway
private domain. Do not generate a public domain for this service.

## 3. Configure `rolevya-web`

Open the PostgreSQL service's **Variables** tab and use Railway variable references
to build this value in the web service. Replace `Postgres` below if your database
service has a different name:

```text
ConnectionStrings__JobTrackerDatabase=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}};SSL Mode=Prefer
```

Add the remaining web variables:

```text
ASPNETCORE_ENVIRONMENT=Production
Services__AiProcessing__BaseUrl=http://<AI_PRIVATE_DOMAIN>:<AI_PRIVATE_PORT>/
Stripe__SecretKey=<Stripe secret key>
Stripe__WebhookSecret=<Stripe endpoint signing secret>
Stripe__MonthlyPriceId=<monthly price_... ID>
Stripe__AnnualPriceId=<annual price_... ID>
Stripe__SuccessUrl=https://rolevya.com/?billing=success
Stripe__CancelUrl=https://rolevya.com/?billing=cancelled
Stripe__PortalReturnUrl=https://rolevya.com/?billing=portal
```

Use the AI service's private domain and internal port shown by Railway. The URL must
start with `http://` and end with `/`. Never put API keys in repository files.

The web container listens on Railway's injected `PORT`. Set its health-check path to
`/health/ready`. On startup, one instance obtains a PostgreSQL advisory lock and
applies committed EF Core migrations. ASP.NET Data Protection keys are also kept in
PostgreSQL, so sign-in cookies survive deployments.

## 4. Test on Railway's temporary domain

Generate a Railway domain for `rolevya-web`. Before the first test, temporarily set
the three `Stripe__...Url` values to that HTTPS domain and redeploy. Confirm:

1. `/health` returns HTTP 200.
2. `/health/ready` returns HTTP 200.
3. A user can register, sign in, upload a CV, import a vacancy and refresh the page.
4. A Stripe sandbox payment activates the Founding Member plan.
5. The billing portal opens and returns to the application.

## 5. Connect `rolevya.com` in Railway and Namecheap

1. In `rolevya-web`, open **Settings > Networking > Custom Domain**.
2. Add `rolevya.com`, then add `www.rolevya.com`.
3. Railway will display the DNS targets it expects. Keep that page open.
4. In Namecheap, open **Domain List > rolevya.com > Manage > Advanced DNS**.
5. Remove the existing `www` parking CNAME only when replacing it with Railway's
   `www` record.
6. Add exactly the CNAME/TXT records Railway displays. Do not invent an IP address.
7. Wait for Railway to verify both names and issue TLS certificates.
8. Choose `rolevya.com` as the canonical address and redirect `www` to it in Railway.

DNS verification can take time. Leave Namecheap nameservers unchanged unless Railway
explicitly asks you to delegate the whole zone.

## 6. Configure the production Stripe endpoint

In Stripe, create a webhook endpoint for:

```text
https://rolevya.com/api/billing/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy this endpoint's own `whsec_...` signing secret into the Railway
`Stripe__WebhookSecret` variable. A Stripe CLI signing secret is local-only and must
not be used for the hosted endpoint.

Keep Stripe in sandbox/test mode until the full flow passes on the custom domain.
When the business account is ready, create live-mode recurring USD prices and replace
all four Stripe values together with their live-mode equivalents. Test keys and live
Price IDs cannot be mixed.

## 7. Release checklist

- Railway deployment is healthy and all migrations completed.
- `https://rolevya.com` and `https://www.rolevya.com` have valid TLS certificates.
- Only `rolevya-web` has a public domain.
- Stripe redirect URLs and Customer Portal return URL use `https://rolevya.com`.
- Stripe webhook deliveries return HTTP 200.
- OpenAI and Stripe secrets exist only as Railway variables.
- Registration, login, logout, CV upload, ATS review, tailoring, PDF download,
  interview preparation, Kanban logging and subscription cancellation are tested.

