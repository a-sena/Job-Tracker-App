from types import SimpleNamespace
from typing import Any

import pytest

from app.main import (
    AiOutputError,
    JobExtractionError,
    GenerateTailoredCvRequest,
    Settings,
    TailoringResult,
    build_tailoring_prompt,
    extract_job_details,
    render_cv_html,
    tailor_cv_with_openai,
    validate_public_job_url,
    validate_and_merge_tailoring,
)


def make_request(full_name: str = "Ada Lovelace") -> GenerateTailoredCvRequest:
    return GenerateTailoredCvRequest.model_validate(
        {
            "MasterCV": {
                "full_name": full_name,
                "professional_summary": "Backend engineer building reliable APIs.",
                "email": "ada@example.no",
                "location": "Oslo, Norway",
                "skills": ["C#", "PostgreSQL", "REST APIs"],
                "work_experience": [
                    {
                        "company": "Example AS",
                        "job_title": "Software Engineer",
                        "start_date": "2022",
                        "end_date": "Present",
                        "location": "Oslo",
                        "bullet_points": [
                            "Built REST APIs in C#.",
                            "Improved PostgreSQL query performance.",
                        ],
                    }
                ],
                "education": [],
                "certifications": [],
                "languages": ["English", "Norwegian"],
            },
            "JobDescription": (
                "Seeking a backend engineer experienced with APIs, C#, "
                "PostgreSQL, Kubernetes, and distributed systems."
            ),
        }
    )


def make_tailoring() -> TailoringResult:
    return TailoringResult.model_validate(
        {
            "professional_summary": (
                "Backend engineer experienced in reliable C# APIs and PostgreSQL."
            ),
            "experience_rewrites": [
                {
                    "experience_index": 0,
                    "bullet_points": [
                        {
                            "source_bullet_index": 0,
                            "text": "Built reliable REST APIs using C#.",
                        },
                        {
                            "source_bullet_index": 1,
                            "text": "Optimized PostgreSQL query performance.",
                        },
                    ],
                }
            ],
            "matched_keywords": ["C#", "PostgreSQL", "APIs"],
            "missing_keywords": ["Kubernetes", "distributed systems"],
            "ats_match_score": 72,
        }
    )


def test_prompt_contains_truthfulness_rules_and_required_mapping() -> None:
    prompt = build_tailoring_prompt(make_request())

    assert "valid JSON" not in prompt  # The system prompt owns global instructions.
    assert '"experience_index":0' in prompt
    assert '"required_source_bullet_indices":[0,1]' in prompt
    assert "<job_description>" in prompt


def test_merge_keeps_source_identity_fields_immutable() -> None:
    request = make_request()
    document = validate_and_merge_tailoring(request.master_cv, make_tailoring())

    experience = document.work_experience[0]
    assert experience.company == "Example AS"
    assert experience.job_title == "Software Engineer"
    assert experience.bullet_points == [
        "Built reliable REST APIs using C#.",
        "Optimized PostgreSQL query performance.",
    ]
    assert document.skills == ["C#", "PostgreSQL", "REST APIs"]


def test_merge_rejects_missing_source_bullet_mapping() -> None:
    request = make_request()
    invalid_tailoring = make_tailoring().model_copy(deep=True)
    invalid_tailoring.experience_rewrites[0].bullet_points.pop()

    with pytest.raises(AiOutputError, match="every source bullet exactly once"):
        validate_and_merge_tailoring(request.master_cv, invalid_tailoring)


def test_html_template_autoescapes_candidate_content() -> None:
    request = make_request(full_name="<script>alert('x')</script>")
    document = validate_and_merge_tailoring(request.master_cv, make_tailoring())

    html = render_cv_html(document)

    assert "<script>" not in html
    assert "&lt;script&gt;" in html


class FakeCompletions:
    def __init__(self, content: str) -> None:
        self.content = content
        self.call_arguments: dict[str, Any] | None = None

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.call_arguments = kwargs
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(
                        content=self.content,
                        refusal=None,
                    ),
                )
            ]
        )


class FakeOpenAiClient:
    def __init__(self, content: str) -> None:
        self.chat = SimpleNamespace(completions=FakeCompletions(content))


@pytest.mark.asyncio
async def test_openai_call_uses_requested_model_and_json_mode() -> None:
    request = make_request()
    expected = make_tailoring()
    client = FakeOpenAiClient(expected.model_dump_json())
    settings = Settings(openai_api_key="test-key")

    result = await tailor_cv_with_openai(  # type: ignore[arg-type]
        request,
        client,
        settings,
    )

    arguments = client.chat.completions.call_arguments
    assert arguments is not None
    assert arguments["model"] == "gpt-4o-mini"
    assert arguments["response_format"] == {"type": "json_object"}
    assert arguments["temperature"] == 0.1
    assert result.ats_match_score == 72


def test_extract_job_details_prefers_schema_org_job_posting() -> None:
    html = """
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Senior Backend Engineer",
            "description": "<p>Build reliable APIs with C# and PostgreSQL.</p>",
            "hiringOrganization": {"@type": "Organization", "name": "Example AS"},
            "jobLocation": {
              "@type": "Place",
              "address": {
                "addressLocality": "Oslo",
                "addressCountry": "NO"
              }
            }
          }
        </script>
      </head>
    </html>
    """

    result = extract_job_details("https://example.no/jobs/123", html)

    assert result.title == "Senior Backend Engineer"
    assert result.company == "Example AS"
    assert result.location == "Oslo, NO"
    assert "Build reliable APIs" in result.description
    assert result.warnings == []


def test_extract_job_details_returns_warnings_for_missing_fields() -> None:
    result = extract_job_details(
        "https://example.no/jobs/empty",
        "<html><head></head><body></body></html>",
    )

    assert result.title == ""
    assert result.company == ""
    assert result.description == ""
    assert len(result.warnings) == 4


@pytest.mark.asyncio
async def test_job_extraction_rejects_local_network_url() -> None:
    with pytest.raises(JobExtractionError, match="Private or local"):
        await validate_public_job_url("http://127.0.0.1/job")
