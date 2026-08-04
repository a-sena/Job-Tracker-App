import base64
import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.main import (
    AiOutputError,
    CoverLetterPackageRequest,
    CoverLetterResult,
    FinalizeTailoredCvRequest,
    JobExtractionError,
    GenerateTailoredCvRequest,
    InterviewQuestionsPackageRequest,
    InterviewQuestionsResult,
    Settings,
    TailoringResult,
    app,
    build_ats_review_prompt,
    build_cover_letter_prompt,
    build_interview_questions_prompt,
    build_tailoring_prompt,
    calculate_ats_score,
    extract_job_details,
    extract_master_cv_from_pdf_with_openai,
    extract_master_cv_with_openai,
    extract_text_from_pdf,
    finalize_tailored_document,
    generate_interview_questions_package,
    generate_interview_questions_with_openai,
    generate_tailored_cv_package,
    prioritize_skills,
    render_interview_questions_html,
    render_cover_letter_html,
    review_cv_with_openai,
    render_cv_html,
    source_cv_document,
    tailor_cv_with_openai,
    validate_public_job_url,
    validate_and_merge_tailoring,
)
from weasyprint import HTML


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


def make_interview_request() -> InterviewQuestionsPackageRequest:
    return InterviewQuestionsPackageRequest.model_validate(
        {
            "jobTitle": "Backend Engineer",
            "company": "Example AS",
            "jobDescription": (
                "Vi søker en backendutvikler som kan bygge pålitelige API-er, "
                "samarbeide med produktteam og kommunisere godt."
            ),
            "masterCv": make_request().master_cv.model_dump(),
        }
    )


def test_review_request_accepts_camel_case_and_legacy_pascal_case() -> None:
    source = make_request()
    master_cv = source.master_cv.model_dump()

    camel_case = GenerateTailoredCvRequest.model_validate(
        {
            "masterCv": master_cv,
            "jobDescription": source.job_description,
        }
    )
    legacy_pascal_case = GenerateTailoredCvRequest.model_validate(
        {
            "MasterCV": master_cv,
            "JobDescription": source.job_description,
        }
    )

    assert camel_case == legacy_pascal_case
    assert set(camel_case.model_dump(by_alias=True)) == {
        "masterCv",
        "jobDescription",
        "keywordBaseline",
    }


def test_workflow_openapi_contracts_are_camel_case_and_strict() -> None:
    schemas = app.openapi()["components"]["schemas"]
    review_request = schemas["GenerateTailoredCvRequest"]
    review_response = schemas["AtsReview"]
    interview_request = schemas["InterviewQuestionsPackageRequest"]
    interview_response = schemas["InterviewQuestionsPackage"]

    assert set(review_request["properties"]) == {
        "masterCv",
        "jobDescription",
        "keywordBaseline",
    }
    assert set(review_response["properties"]) == {
        "atsMatchScore",
        "matchedKeywords",
        "missingKeywords",
        "explanation",
        "details",
    }
    assert set(review_response["required"]) == set(review_response["properties"])
    assert set(interview_request["properties"]) == {
        "jobTitle",
        "company",
        "jobDescription",
        "masterCv",
    }
    assert set(interview_response["properties"]) == {
        "questions",
        "pdfBase64",
        "fileName",
    }
    assert review_request["additionalProperties"] is False
    assert interview_request["additionalProperties"] is False


def make_interview_result() -> InterviewQuestionsResult:
    return InterviewQuestionsResult.model_validate(
        {
            "language": "Norwegian",
            "questions": [
                "Kan du fortelle litt om bakgrunnen din?",
                "Hvorfor ønsker du denne rollen?",
                "Hva interesserer deg ved Example AS?",
                "Hvordan er erfaringen din relevant for denne stillingen?",
                "Kan du beskrive et godt samarbeid med et produktteam?",
                "Hvordan prioriterer du når flere oppgaver haster?",
                "Hva er viktig for at du skal trives på arbeidsplassen?",
                "Når vil du kunne starte i en ny rolle?",
            ],
        }
    )


def test_prompt_contains_truthfulness_rules_and_required_mapping() -> None:
    prompt = build_tailoring_prompt(make_request())

    assert "valid JSON" not in prompt  # The system prompt owns global instructions.
    assert '"experience_index":0' in prompt
    assert '"required_source_bullet_indices":[0,1]' in prompt
    assert "<job_description>" in prompt


def test_tailoring_prompt_contains_fixed_reviewed_keyword_baseline() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["keywordBaseline"] = {
        "matchedKeywords": ["C#", "PostgreSQL", "APIs"],
        "missingKeywords": ["Kubernetes", "distributed systems"],
    }
    prompt = build_tailoring_prompt(
        GenerateTailoredCvRequest.model_validate(request_data)
    )

    assert "<keyword_baseline_json>" in prompt
    assert '"matchedKeywords":["C#","PostgreSQL","APIs"]' in prompt
    assert "copy its matchedKeywords" in prompt


def test_keyword_baseline_rejects_contradictory_classification() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["keywordBaseline"] = {
        "matchedKeywords": ["PostgreSQL"],
        "missingKeywords": ["postgresql"],
    }

    with pytest.raises(ValueError, match="mutually exclusive"):
        GenerateTailoredCvRequest.model_validate(request_data)


def test_language_requirement_receives_factual_placement_credit() -> None:
    document = source_cv_document(make_request().master_cv)

    score = calculate_ats_score(document, ["Norwegian"], [])

    assert score >= 75


def test_ats_review_prompt_contains_same_rubric_and_source_boundaries() -> None:
    prompt = build_ats_review_prompt(make_request())

    assert "60/20/10/10 rubric" in prompt
    assert "<master_cv_json>" in prompt
    assert "<job_description>" in prompt
    assert '"atsMatchScore"' in prompt


def test_interview_prompt_is_bounded_to_first_round_and_factual_cv() -> None:
    prompt = build_interview_questions_prompt(make_interview_request())

    assert "first-round interview" in prompt
    assert "<master_cv_json>" in prompt
    assert "<job_description>" in prompt
    assert "Do not include answers" in prompt


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


def test_projects_and_courses_are_preserved_in_classic_norwegian_cv() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["masterCv"].update(
        {
            "headline": "Produktdesigner (UX/UI)",
            "professional_summary": (
                "Produktdesigner med erfaring fra brukerinnsikt, prototyping og "
                "samarbeid med utviklingsteam."
            ),
            "projects": [
                {
                    "name": "SiO redesign",
                    "role": "UX-designer",
                    "start_date": "2024",
                    "end_date": "2024",
                    "url": "https://example.no/sio",
                    "technologies": ["Figma"],
                    "bullet_points": ["Gjennomførte brukertesting og prototyping."],
                }
            ],
            "courses": [
                {
                    "name": "Universell utforming",
                    "provider": "OsloMet",
                    "completed_date": "2024",
                    "details": [],
                }
            ],
        }
    )
    request = GenerateTailoredCvRequest.model_validate(request_data)
    tailoring_data = make_tailoring().model_dump()
    tailoring_data["professional_summary"] = request.master_cv.professional_summary
    tailoring_data["project_rewrites"] = [
        {
            "project_index": 0,
            "bullet_points": [
                {
                    "source_bullet_index": 0,
                    "text": "Planla brukertesting og utviklet prototyper i Figma.",
                }
            ],
        }
    ]
    tailoring = TailoringResult.model_validate(tailoring_data)

    document = validate_and_merge_tailoring(request.master_cv, tailoring)
    html = render_cv_html(document)

    assert document.projects[0].name == "SiO redesign"
    assert document.projects[0].technologies == ["Figma"]
    assert document.courses[0].name == "Universell utforming"
    assert "UTVALGTE PROSJEKTER" in html.upper()
    assert "KURS OG OPPLÆRING" in html.upper()
    assert "#2563eb" not in html
    assert "display: flex" not in html
    pdf = HTML(string=html).write_pdf()
    extracted_text, _ = extract_text_from_pdf(
        pdf,
        max_pages=5,
        max_text_characters=10_000,
    )
    assert "SiO redesign" in extracted_text
    assert "Universell utforming" in extracted_text


@pytest.mark.asyncio
async def test_unverified_matched_keyword_is_moved_to_missing() -> None:
    candidate = {
        "atsMatchScore": 99,
        "matchedKeywords": ["C#", "Kubernetes"],
        "missingKeywords": [],
        "keywordEvidence": [],
        "explanation": "Only facts in the source CV may count.",
    }
    client = FakeOpenAiClient(json.dumps(candidate))

    result = await review_cv_with_openai(  # type: ignore[arg-type]
        make_request(),
        client,
        Settings(openai_api_key="test-key"),
    )

    assert result.matched_keywords == ["C#"]
    assert result.missing_keywords == ["Kubernetes"]
    assert result.ats_match_score < 99


@pytest.mark.asyncio
async def test_norwegian_keyword_matches_grounded_english_cv_equivalent() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["masterCv"]["courses"] = [
        {
            "name": "TryHackMe - Jr Penetration Tester",
            "provider": None,
            "completed_date": None,
            "details": ["Practical penetration testing training"],
        }
    ]
    candidate = {
        "atsMatchScore": 0,
        "matchedKeywords": ["Cybersikkerhet"],
        "missingKeywords": ["Penetrasjonstesting"],
        "keywordEvidence": [],
        "explanation": "The CV contains relevant security training.",
    }

    result = await review_cv_with_openai(  # type: ignore[arg-type]
        GenerateTailoredCvRequest.model_validate(request_data),
        FakeOpenAiClient(json.dumps(candidate)),
        Settings(openai_api_key="test-key"),
    )

    assert "Penetrasjonstesting" in result.matched_keywords
    assert "Penetrasjonstesting" not in result.missing_keywords
    assert any(
        item.keyword == "Penetrasjonstesting"
        and "Penetration Tester" in item.evidence_text
        for item in result.details.keyword_evidence
    )


@pytest.mark.asyncio
async def test_short_ai_keyword_does_not_match_inside_unrelated_word() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["masterCv"]["skills"] = ["TailwindCSS"]
    candidate = {
        "atsMatchScore": 0,
        "matchedKeywords": ["AI"],
        "missingKeywords": [],
        "keywordEvidence": [],
        "explanation": "AI must have explicit support.",
    }

    result = await review_cv_with_openai(  # type: ignore[arg-type]
        GenerateTailoredCvRequest.model_validate(request_data),
        FakeOpenAiClient(json.dumps(candidate)),
        Settings(openai_api_key="test-key"),
    )

    assert result.matched_keywords == []
    assert result.missing_keywords == ["AI"]


@pytest.mark.asyncio
async def test_review_accepts_camel_case_keyword_evidence_from_openai() -> None:
    candidate = {
        "atsMatchScore": 0,
        "matchedKeywords": ["REST APIs"],
        "missingKeywords": ["Kubernetes"],
        "keywordEvidence": [
            {
                "keyword": "REST APIs",
                "evidenceText": "Built REST APIs in C#.",
            }
        ],
        "explanation": "The CV supports REST APIs but not Kubernetes.",
    }
    client = FakeOpenAiClient(json.dumps(candidate))

    result = await review_cv_with_openai(  # type: ignore[arg-type]
        make_request(),
        client,
        Settings(openai_api_key="test-key"),
    )

    assert result.matched_keywords == ["REST APIs"]
    assert result.missing_keywords == ["Kubernetes"]


class FakeCompletions:
    def __init__(self, content: str | list[str]) -> None:
        self.contents = [content] if isinstance(content, str) else content
        self.call_arguments: dict[str, Any] | None = None
        self.call_history: list[dict[str, Any]] = []
        self.call_index = 0

    def next_content(self) -> str:
        content = self.contents[min(self.call_index, len(self.contents) - 1)]
        self.call_index += 1
        return content

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.call_arguments = kwargs
        self.call_history.append(kwargs)
        content = self.next_content()
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(
                        content=content,
                        refusal=None,
                    ),
                )
            ]
        )

    async def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.call_arguments = kwargs
        self.call_history.append(kwargs)
        response_model = kwargs["response_format"]
        content = self.next_content()
        parsed = response_model.model_validate_json(content)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(
                        content=content,
                        parsed=parsed,
                        refusal=None,
                    ),
                )
            ]
        )


class FakeOpenAiClient:
    def __init__(self, content: str | list[str]) -> None:
        completions = FakeCompletions(content)
        self.chat = SimpleNamespace(completions=completions)
        self.responses = FakeResponses(completions)


class FakeResponses:
    def __init__(self, completions: FakeCompletions) -> None:
        self.completions = completions
        self.call_arguments: dict[str, Any] | None = None

    async def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.call_arguments = kwargs
        content = self.completions.next_content()
        parsed = kwargs["text_format"].model_validate_json(content)
        return SimpleNamespace(output_parsed=parsed)


@pytest.mark.asyncio
async def test_ats_review_uses_configured_model_json_mode_and_fixed_contract() -> None:
    expected = {
        "atsMatchScore": 58,
        "matchedKeywords": ["C#", "PostgreSQL", "APIs"],
        "missingKeywords": ["Kubernetes", "distributed systems"],
        "explanation": (
            "The CV supports the core backend requirements, but does not "
            "evidence the requested orchestration and distributed-systems work."
        ),
    }
    client = FakeOpenAiClient(json.dumps(expected))
    settings = Settings(openai_api_key="test-key")

    result = await review_cv_with_openai(  # type: ignore[arg-type]
        make_request(),
        client,
        settings,
    )

    arguments = client.chat.completions.call_arguments
    assert arguments is not None
    assert arguments["model"] == "gpt-4o-mini"
    assert arguments["response_format"] == {"type": "json_object"}
    assert arguments["temperature"] == 0
    assert result.ats_match_score == 64
    assert result.model_dump(by_alias=True)["atsMatchScore"] == 64
    assert len(result.details.score_breakdown) == 4
    assert result.details.section_feedback
    assert round(sum(item.score for item in result.details.score_breakdown)) == 64
    assert {item.keyword for item in result.details.keyword_evidence} == {
        "C#",
        "PostgreSQL",
        "APIs",
    }
    assert result.details.priority_actions


@pytest.mark.asyncio
async def test_ats_review_rejects_contradictory_keyword_classification() -> None:
    contradictory = {
        "atsMatchScore": 50,
        "matchedKeywords": ["PostgreSQL"],
        "missingKeywords": ["postgresql"],
        "explanation": "The classification is contradictory.",
    }
    client = FakeOpenAiClient(json.dumps(contradictory))
    settings = Settings(openai_api_key="test-key")

    with pytest.raises(AiOutputError, match="both matched and missing"):
        await review_cv_with_openai(  # type: ignore[arg-type]
            make_request(),
            client,
            settings,
        )


@pytest.mark.asyncio
async def test_interview_questions_use_json_mode_and_first_round_guardrails() -> None:
    expected = make_interview_result()
    client = FakeOpenAiClient(expected.model_dump_json())
    settings = Settings(openai_api_key="test-key")

    result = await generate_interview_questions_with_openai(  # type: ignore[arg-type]
        make_interview_request(),
        client,
        settings,
    )

    arguments = client.chat.completions.call_arguments
    assert arguments is not None
    assert arguments["model"] == "gpt-4o-mini"
    assert arguments["response_format"] == {"type": "json_object"}
    assert arguments["temperature"] == 0.2
    assert "Do not produce deep technical" in arguments["messages"][0]["content"]
    assert result.language == "Norwegian"
    assert len(result.questions) == 8


def test_interview_question_contract_requires_eight_to_ten_unique_questions() -> None:
    result = make_interview_result().model_dump()
    result["questions"] = result["questions"][:7]

    with pytest.raises(ValueError):
        InterviewQuestionsResult.model_validate(result)

    result = make_interview_result().model_dump()
    result["questions"][-1] = result["questions"][0]
    with pytest.raises(ValueError, match="unique"):
        InterviewQuestionsResult.model_validate(result)


def test_interview_pdf_template_autoescapes_all_dynamic_content() -> None:
    request = make_interview_request().model_copy(
        update={
            "job_title": "<script>alert('title')</script>",
            "company": "<img src=x onerror=alert('company')>",
        }
    )
    result = make_interview_result().model_copy(deep=True)
    result.questions[0] = "<script>alert('question')</script>"

    html = render_interview_questions_html(request, result)

    assert "<script>" not in html
    assert "<img" not in html
    assert "&lt;script&gt;" in html
    assert "&lt;img" in html


@pytest.mark.asyncio
async def test_interview_package_contains_questions_pdf_and_safe_filename(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = make_interview_request()
    result = make_interview_result()
    client = FakeOpenAiClient(result.model_dump_json())
    settings = Settings(openai_api_key="test-key")
    monkeypatch.setattr(
        "app.main.render_interview_questions_pdf",
        lambda _request, _result: b"%PDF-interview-test",
    )

    package = await generate_interview_questions_package(  # type: ignore[arg-type]
        request,
        client,
        settings,
    )

    assert package.questions == result.questions
    assert base64.b64decode(package.pdf_base64) == b"%PDF-interview-test"
    assert (
        package.file_name
        == "example-as-backend-engineer-interview-questions.pdf"
    )
    serialized = package.model_dump(by_alias=True)
    assert serialized["pdfBase64"]
    assert serialized["fileName"].endswith(".pdf")


@pytest.mark.asyncio
async def test_openai_call_uses_requested_model_and_json_mode() -> None:
    request = make_request()
    expected = make_tailoring()
    client = FakeOpenAiClient(expected.model_dump_json())
    settings = Settings(
        openai_api_key="test-key",
        openai_ats_refinement_threshold=0,
    )

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
    assert result.ats_match_score == 76


@pytest.mark.asyncio
async def test_tailoring_reuses_reviewed_keyword_baseline_exactly() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["keywordBaseline"] = {
        "matchedKeywords": ["C#", "PostgreSQL", "APIs"],
        "missingKeywords": ["Kubernetes", "distributed systems"],
    }
    request = GenerateTailoredCvRequest.model_validate(request_data)
    model_result = make_tailoring().model_copy(
        update={
            "matched_keywords": ["Kubernetes"],
            "missing_keywords": ["C#"],
        }
    )
    client = FakeOpenAiClient(model_result.model_dump_json())

    result = await tailor_cv_with_openai(  # type: ignore[arg-type]
        request,
        client,
        Settings(
            openai_api_key="test-key",
            openai_ats_refinement_threshold=0,
        ),
    )

    assert result.matched_keywords == ["C#", "PostgreSQL", "APIs"]
    assert result.missing_keywords == ["Kubernetes", "distributed systems"]


@pytest.mark.asyncio
async def test_tailoring_never_returns_a_document_scoring_below_source_cv() -> None:
    request_data = make_request().model_dump(by_alias=True)
    request_data["keywordBaseline"] = {
        "matchedKeywords": ["C#", "PostgreSQL", "APIs"],
        "missingKeywords": ["Kubernetes", "distributed systems"],
    }
    request = GenerateTailoredCvRequest.model_validate(request_data)
    degraded_data = make_tailoring().model_dump()
    degraded_data["professional_summary"] = "Backend engineer building services."
    degraded_data["experience_rewrites"][0]["bullet_points"][0]["text"] = (
        "Built reliable backend services."
    )
    degraded_data["experience_rewrites"][0]["bullet_points"][1]["text"] = (
        "Improved database query performance."
    )
    degraded = TailoringResult.model_validate(degraded_data)

    result = await tailor_cv_with_openai(  # type: ignore[arg-type]
        request,
        FakeOpenAiClient(degraded.model_dump_json()),
        Settings(
            openai_api_key="test-key",
            openai_ats_refinement_threshold=0,
        ),
    )

    source_score = calculate_ats_score(
        source_cv_document(request.master_cv),
        request.keyword_baseline.matched_keywords,
        request.keyword_baseline.missing_keywords,
    )
    assert result.ats_match_score == source_score
    assert result.professional_summary == request.master_cv.professional_summary
    assert result.experience_rewrites[0].bullet_points[0].text == (
        "Built REST APIs in C#."
    )


@pytest.mark.asyncio
async def test_low_ats_result_gets_grounded_refinement() -> None:
    initial = make_tailoring()
    initial.ats_match_score = 62
    initial.professional_summary = "Backend engineer building reliable services."
    improved = make_tailoring()
    improved.ats_match_score = 81
    improved.professional_summary = (
        "Backend engineer building reliable C# REST APIs with PostgreSQL."
    )
    client = FakeOpenAiClient(
        [initial.model_dump_json(), improved.model_dump_json()]
    )
    settings = Settings(
        openai_api_key="test-key",
        openai_ats_refinement_threshold=75,
    )

    result = await tailor_cv_with_openai(  # type: ignore[arg-type]
        make_request(),
        client,
        settings,
    )

    assert result.ats_match_score == 76
    assert len(client.chat.completions.call_history) == 2
    second_prompt = client.chat.completions.call_history[1]["messages"][1]["content"]
    assert "<first_draft_json>" in second_prompt


def test_existing_job_relevant_skills_are_prioritized_without_changes() -> None:
    skills = ["Docker", "C#", "PostgreSQL", "Communication"]

    prioritized = prioritize_skills(
        skills,
        "We need PostgreSQL and C# experience.",
    )

    assert prioritized == ["C#", "PostgreSQL", "Docker", "Communication"]
    assert set(prioritized) == set(skills)


@pytest.mark.asyncio
async def test_package_contains_metadata_document_and_pdf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = make_request()
    client = FakeOpenAiClient(make_tailoring().model_dump_json())
    settings = Settings(openai_api_key="test-key")
    monkeypatch.setattr("app.main.render_pdf", lambda _document: b"%PDF-test")

    package = await generate_tailored_cv_package(  # type: ignore[arg-type]
        request,
        client,
        settings,
    )

    assert package.ats_match_score == 76
    assert package.tailored_cv.full_name == "Ada Lovelace"
    assert package.missing_keywords == ["Kubernetes", "distributed systems"]
    assert base64.b64decode(package.pdf_base64) == b"%PDF-test"
    assert package.file_name == "ada-lovelace-tailored-cv.pdf"


def test_extract_text_from_text_based_pdf() -> None:
    pdf = HTML(
        string=(
            "<h1>Ada Lovelace</h1>"
            "<p>Backend engineer with C# and PostgreSQL experience.</p>"
        )
    ).write_pdf()

    text, warnings = extract_text_from_pdf(pdf, max_pages=5, max_text_characters=5_000)

    assert "Ada Lovelace" in text
    assert "PostgreSQL" in text
    assert warnings == []


@pytest.mark.asyncio
async def test_pdf_cv_ai_extraction_uses_structured_outputs() -> None:
    expected = make_request().master_cv
    client = FakeOpenAiClient(expected.model_dump_json())
    settings = Settings(openai_api_key="test-key")

    extracted = await extract_master_cv_with_openai(  # type: ignore[arg-type]
        "Ada Lovelace - Backend engineer with C# and PostgreSQL experience.",
        client,
        settings,
    )

    arguments = client.chat.completions.call_arguments
    assert arguments is not None
    assert arguments["model"] == "gpt-4o-mini"
    assert arguments["response_format"].__name__ == "MasterCv"
    assert arguments["temperature"] == 0
    assert extracted.full_name == "Ada Lovelace"


@pytest.mark.asyncio
async def test_visual_pdf_cv_extraction_uses_private_structured_file_input() -> None:
    expected = make_request().master_cv
    client = FakeOpenAiClient(expected.model_dump_json())
    settings = Settings(openai_api_key="test-key")

    extracted = await extract_master_cv_from_pdf_with_openai(  # type: ignore[arg-type]
        b"%PDF-scanned-cv",
        r"C:\uploads\retail-cv.pdf",
        client,
        settings,
    )

    arguments = client.responses.call_arguments
    assert arguments is not None
    assert arguments["model"] == "gpt-4o-mini"
    assert arguments["text_format"].__name__ == "MasterCv"
    assert arguments["store"] is False
    file_input = arguments["input"][0]["content"][0]
    assert file_input["type"] == "input_file"
    assert file_input["filename"] == "retail-cv.pdf"
    assert file_input["detail"] == "high"
    assert file_input["file_data"].startswith(
        "data:application/pdf;base64,JVBERi1zY2FubmVkLWN2"
    )
    assert extracted.full_name == "Ada Lovelace"


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


def test_finalize_tailored_document_applies_only_selected_generated_changes() -> None:
    source_request = make_request()
    proposal = validate_and_merge_tailoring(
        source_request.master_cv,
        make_tailoring(),
        source_request.job_description,
    )
    request = FinalizeTailoredCvRequest.model_validate(
        {
            "masterCv": source_request.master_cv.model_dump(),
            "proposedCv": proposal.model_dump(),
            "acceptedChangeIds": ["summary", "experience:0:bullet:1"],
            "jobDescription": source_request.job_description,
            "keywordBaseline": {
                "matchedKeywords": ["C#", "PostgreSQL", "APIs"],
                "missingKeywords": ["Kubernetes", "distributed systems"],
            },
        }
    )

    finalized = finalize_tailored_document(request)

    assert finalized.professional_summary == proposal.professional_summary
    assert (
        finalized.work_experience[0].bullet_points[0]
        == source_request.master_cv.work_experience[0].bullet_points[0]
    )
    assert (
        finalized.work_experience[0].bullet_points[1]
        == proposal.work_experience[0].bullet_points[1]
    )


def test_finalize_tailored_document_rejects_unknown_change_id() -> None:
    source_request = make_request()
    proposal = validate_and_merge_tailoring(
        source_request.master_cv,
        make_tailoring(),
        source_request.job_description,
    )
    request = FinalizeTailoredCvRequest.model_validate(
        {
            "masterCv": source_request.master_cv.model_dump(),
            "proposedCv": proposal.model_dump(),
            "acceptedChangeIds": ["invented:change"],
            "jobDescription": source_request.job_description,
            "keywordBaseline": {
                "matchedKeywords": ["C#"],
                "missingKeywords": ["Kubernetes"],
            },
        }
    )

    with pytest.raises(AiOutputError, match="invalid or stale"):
        finalize_tailored_document(request)


def test_cover_letter_prompt_and_template_keep_inputs_bounded_and_escaped() -> None:
    request = CoverLetterPackageRequest.model_validate(
        {
            "jobTitle": "Backend Engineer",
            "company": "Example <AS>",
            "jobDescription": make_request().job_description,
            "cv": make_request("Ada <Lovelace>").master_cv.model_dump(),
        }
    )
    result = CoverLetterResult(
        language="English",
        subject="Application for Backend Engineer",
        paragraphs=[
            "I am applying for the role.",
            "My CV documents C# API and PostgreSQL experience.",
            "I would welcome a conversation about the position.",
        ],
        evidence=[
            {
                "claim": "C# API experience",
                "evidenceText": "Built REST APIs in C#.",
            }
        ],
    )

    prompt = build_cover_letter_prompt(request)
    html = render_cover_letter_html(request, result)

    assert "only supported facts" in prompt
    assert "Example &lt;AS&gt;" in html
    assert "Ada &lt;Lovelace&gt;" in html
