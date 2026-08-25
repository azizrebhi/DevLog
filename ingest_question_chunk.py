import json
import logging
from uuid import UUID

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.model import DocumentChunk, DocumentParentChunk  # adjust import path to your project

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.7
MODEL = "gpt-5-mini"  # cheap + capable enough for structural extraction; bump to
                       # "gpt-5.4-mini" if you see confidence scores dropping on messy Parties

EXTRACTION_PROMPT = """You are structurally extracting exam questions and their corrections from OCR'd French math exam markdown. The OCR has scrambled numbering, split formulas across lines, and sometimes merged sub-question markers into surrounding text — use mathematical/semantic understanding, not just visual numbering, to determine true question boundaries.

QUESTION SECTION:
{question_md}

CORRECTION SECTION:
{correction_md}

Return ONLY valid JSON, no markdown fences, no preamble, matching this exact shape:
{{
  "questions": [
    {{
      "question_number": "1" or "1.a" or "2.b.i",
      "question_text": "cleaned question statement, LaTeX preserved exactly as in source",
      "correction_text": "matching correction text, or null if no match was found",
      "extraction_confidence": 0.0 to 1.0,
      "notes": "brief reason for low confidence, or null"
    }}
  ],
  "unmatched_correction_fragments": [
    {{"raw_text": "...", "best_guess_question_number": "3", "confidence": 0.0}}
  ]
}}

Rules:
- Set extraction_confidence below 0.7 whenever question/correction boundaries were ambiguous due to OCR corruption.
- Never invent text that isn't present in the source.
- Preserve LaTeX/math notation exactly as given, don't reformat it.
"""


async def call_llm_extract(
    openai_client: AsyncOpenAI, question_md: str, correction_md: str | None, retries: int = 2
) -> dict:
    prompt = EXTRACTION_PROMPT.format(
        question_md=question_md,
        correction_md=correction_md or "(no correction section — preamble only)",
    )
    last_error = None
    for attempt in range(1, retries + 2):  # e.g. retries=2 -> up to 3 total attempts
        try:
            response = await openai_client.chat.completions.create(
                model=MODEL,
                max_completion_tokens=8000,  # bumped from 4000 — larger Parties (like Taylor,
                                              # 11k+ chars combined) generate longer JSON output
                response_format={"type": "json_object"},
                reasoning_effort="low",
                timeout=240,  # bumped from 120 — give the biggest Parties real room
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = response.choices[0].message.content.strip()
            return json.loads(raw_text)
        except json.JSONDecodeError:
            logger.error("Failed to parse LLM extraction JSON: %s", raw_text[:500])
            return {"questions": [], "unmatched_correction_fragments": []}
        except Exception as e:
            last_error = e
            logger.warning("Extraction attempt %d/%d failed: %s", attempt, retries + 1, e)

    raise last_error


async def ingest_question_chunks(
    session: AsyncSession,
    openai_client: AsyncOpenAI,
    document_id: UUID,
    parent_results: list[dict],  # output of Step 2's ingest_parent_chunks()
) -> list[str]:
    """
    For each parent chunk, calls the LLM to extract question/answer pairs
    and persists them as DocumentChunk rows.

    Returns a list of parent titles that failed extraction entirely
    (e.g. after retries were exhausted) — an empty list means every
    parent that had a correction_md was successfully processed.
    """
    chunk_index = 0
    total = len(parent_results)
    failed_parents: list[str] = []

    for i, parent in enumerate(parent_results, start=1):
        if parent["correction_md"] is None:
            # Preamble section (e.g. "Problème") — nothing to extract.
            print(f"[{i}/{total}] '{parent['title']}' has no correction_md, skipping")
            continue

        print(f"[{i}/{total}] Extracting questions from '{parent['title']}'...")

        parent_chunk = await session.get(DocumentParentChunk, parent["parent_chunk_id"])
        question_md = parent_chunk.content

        try:
            extraction = await call_llm_extract(openai_client, question_md, parent["correction_md"])
        except Exception as e:
            logger.error("LLM extraction failed for parent '%s': %s", parent["title"], e)
            print(f"[{i}/{total}] FAILED after retries: {e}")
            failed_parents.append(parent["title"])
            continue

        print(f"[{i}/{total}] Got {len(extraction.get('questions', []))} questions")

        for q in extraction.get("questions", []):
            confidence = q.get("extraction_confidence")
            needs_review = (
                confidence is None
                or confidence < CONFIDENCE_THRESHOLD
                or q.get("correction_text") is None
            )

            chunk = DocumentChunk(
                document_id=document_id,
                parent_id=parent["parent_chunk_id"],
                chunk_index=chunk_index,
                question_number=q.get("question_number"),
                question=q["question_text"],
                answer=q.get("correction_text"),
                extraction_confidence=confidence,
                needs_review=needs_review,
            )
            session.add(chunk)
            chunk_index += 1

        unmatched = extraction.get("unmatched_correction_fragments", [])
        if unmatched:
            logger.warning(
                "document_id=%s parent '%s' has %d unmatched correction fragments: %s",
                document_id, parent["title"], len(unmatched),
                [u["best_guess_question_number"] for u in unmatched],
            )

    await session.flush()
    return failed_parents