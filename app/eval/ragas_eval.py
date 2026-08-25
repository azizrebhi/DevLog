import argparse
import asyncio
import json
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import (
    answer_relevancy,
    faithfulness,
    context_precision,
    context_recall,
)
from ragas.run_config import RunConfig
from langchain_openai import ChatOpenAI


def load_testset(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Testset JSON must be a list of objects")
    required = {"query", "reference"}
    for idx, item in enumerate(data):
        if not required.issubset(item.keys()):
            missing = required - set(item.keys())
            raise ValueError(f"Item {idx} missing keys: {missing}")
        if "document_ids" in item and item["document_ids"] is not None:
            if not isinstance(item["document_ids"], list):
                raise ValueError(f"Item {idx} has non-list document_ids")
    return data


def parse_document_ids_csv(document_ids_csv: str | None) -> list[str] | None:
    if not document_ids_csv:
        return None
    raw = [item.strip() for item in document_ids_csv.split(",") if item.strip()]
    if not raw:
        return None
    # Validate UUID format early to fail fast.
    for doc_id in raw:
        UUID(doc_id)
    return raw


async def fetch_answer(
    client: httpx.AsyncClient,
    base_url: str,
    workspace_id: str,
    token: str,
    query: str,
    limit: int,
    document_ids: list[str] | None,
) -> dict[str, Any]:
    url = f"{base_url}/workspaces/{workspace_id}/answer"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {"query": query, "limit": limit}
    if document_ids:
        payload["document_ids"] = document_ids
    response = await client.post(url, headers=headers, json=payload, timeout=120.0)
    response.raise_for_status()
    return response.json()


async def build_eval_rows(
    base_url: str,
    workspace_id: str,
    token: str,
    testset: list[dict[str, Any]],
    limit: int,
    default_document_ids: list[str] | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    
    print(f"-> Starting backend data retrieval for {len(testset)} test items...")
    async with httpx.AsyncClient() as client:
        # Loop sequentially to protect local FastAPI resource allocations
        for idx, item in enumerate(testset):
            item_document_ids = item.get("document_ids") or default_document_ids
            try:
                print(f"   [{idx + 1}/{len(testset)}] Fetching answer for: '{item['query'][:40]}...'")
                result = await fetch_answer(
                    client=client,
                    base_url=base_url,
                    workspace_id=workspace_id,
                    token=token,
                    query=item["query"],
                    limit=limit,
                    document_ids=item_document_ids,
                )
                # Use model-returned citation content as contexts for faithfulness checks.
                contexts = [c["content"] for c in result.get("citations", [])]
                rows.append(
                    {
                        "user_input": item["query"],
                        "response": result.get("answer", ""),
                        "reference": item["reference"],
                        "retrieved_contexts": contexts,
                        "route": result.get("route", "unknown"),
                    }
                )
            except Exception as e:
                print(f"⚠️ Error fetching item {idx + 1}: {e}")
                
    return rows


def run_ragas(rows: list[dict[str, Any]], model_name: str) -> Any:
    dataset = EvaluationDataset.from_list(rows)

    llm = ChatOpenAI(model=model_name, temperature=0)
    ragas_llm = LangchainLLMWrapper(llm)

    print("-> Data collection finished. Handing payload to OpenAI for RAGAS Scoring...")
    result = evaluate(
        dataset=dataset,
        metrics=[answer_relevancy, faithfulness, context_precision, context_recall],
        llm=ragas_llm,
        run_config=RunConfig(timeout=300, max_workers=2),
    )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run RAGAS evaluation on /answer endpoint")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--testset", default="app/eval/testset.json")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--model", default="gpt-4o-mini")
    parser.add_argument(
        "--document-ids",
        default=None,
        help="Comma-separated document UUIDs. Used for all test items unless item-specific document_ids is set.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    testset = load_testset(Path(args.testset))
    default_document_ids = parse_document_ids_csv(args.document_ids)

    rows = asyncio.run(
        build_eval_rows(
            base_url=args.base_url,
            workspace_id=args.workspace_id,
            token=args.token,
            testset=testset,
            limit=args.limit,
            default_document_ids=default_document_ids,
        )
    )

    if not rows:
        print("❌ Error: No validation rows were successfully compiled. Aborting.")
        return

    result = run_ragas(rows, model_name=args.model)
    print("=== RAGAS Results ===")
    print(result)


if __name__ == "__main__":
    main()
