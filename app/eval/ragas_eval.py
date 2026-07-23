import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

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
    required = {"query", "reference", "contexts"}
    for idx, item in enumerate(data):
        if not required.issubset(item.keys()):
            missing = required - set(item.keys())
            raise ValueError(f"Item {idx} missing keys: {missing}")
    return data


async def fetch_answer(
    client: httpx.AsyncClient,
    base_url: str,
    workspace_id: str,
    token: str,
    query: str,
    limit: int,
) -> dict[str, Any]:
    url = f"{base_url}/workspaces/{workspace_id}/answer"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {"query": query, "limit": limit}
    response = await client.post(url, headers=headers, json=payload, timeout=120.0)
    response.raise_for_status()
    return response.json()


async def build_eval_rows(
    base_url: str,
    workspace_id: str,
    token: str,
    testset: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    async with httpx.AsyncClient() as client:
        for item in testset:
            result = await fetch_answer(
                client=client,
                base_url=base_url,
                workspace_id=workspace_id,
                token=token,
                query=item["query"],
                limit=limit,
            )
            # Use model-returned citation content as contexts for faithfulness checks.
            contexts = [c["content"] for c in result.get("citations", [])]
            rows.append(
                {
                    "user_input": item["query"],
                    "response": result.get("answer", ""),
                    "reference": item["reference"],
                    "retrieved_contexts": contexts,
                }
            )
    return rows


def run_ragas(rows: list[dict[str, Any]], model_name: str) -> Any:
    dataset = EvaluationDataset.from_list(rows)

    llm = ChatOpenAI(model=model_name, temperature=0)
    ragas_llm = LangchainLLMWrapper(llm)

    result = evaluate(
        dataset=dataset,
        metrics=[answer_relevancy, faithfulness, context_precision, context_recall],
        llm=ragas_llm,
        run_config=RunConfig(timeout=120),
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    testset = load_testset(Path(args.testset))

    rows = asyncio.run(
        build_eval_rows(
            base_url=args.base_url,
            workspace_id=args.workspace_id,
            token=args.token,
            testset=testset,
            limit=args.limit,
        )
    )

    result = run_ragas(rows, model_name=args.model)
    print("=== RAGAS Results ===")
    print(result)


if __name__ == "__main__":
    main()
