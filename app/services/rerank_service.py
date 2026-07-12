from sentence_transformers import CrossEncoder

RERANK_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
reranker = CrossEncoder(RERANK_MODEL_NAME)

def rerank_chunks(query: str, chunks: list, top_n: int = 5):
    if not chunks:
        return []

    pairs = [(query, c.content) for c in chunks]
    scores = reranker.predict(pairs)  # higher = more relevant

    scored = list(zip(chunks, scores))
    scored.sort(key=lambda x: float(x[1]), reverse=True)
    return [c for c, _ in scored[:top_n]]