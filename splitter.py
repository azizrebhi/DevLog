import re
import unicodedata
from difflib import SequenceMatcher

COVER_STOPLIST = [
    "republique tunisienne",
    "ministere de",
    "concours mathematiques et physique epreuve",
]


def normalize_title(t: str) -> str:
    t = t.lower().strip()
    t = re.sub(r"\(\d+[.,]?\d*\s*points?\)", "", t)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9 ]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def is_cover_noise(norm_title: str) -> bool:
    return any(stop in norm_title for stop in COVER_STOPLIST) or len(norm_title) < 3


def title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def split_document(md: str, fuzzy_threshold: float = 0.75):
    """
    Splits a docling-extracted exam markdown into énoncé/corrigé halves,
    then pairs matching '##' sections (Exercice, Problème, Partie N...)
    between the two halves using exact then fuzzy title matching.

    Returns:
        paired: list of dicts with title, question_md, correction_md, confidence
        unmatched_corrige: leftover corrigé sections that found no énoncé match
    """
    corrige_match = re.search(
        r"##\s*Concours.*Corrig[ée]\s+de\s+l'[ée]preuve", md, re.IGNORECASE
    )
    if not corrige_match:
        raise ValueError(
            "Could not locate énoncé/corrigé boundary — flag document for manual split"
        )

    enonce_md = md[: corrige_match.start()]
    corrige_md = md[corrige_match.start() :]
    header_re = re.compile(r"^##\s+(.+)$", re.MULTILINE)

    def extract_sections(text):
        headers = list(header_re.finditer(text))
        sections = []
        for i, h in enumerate(headers):
            norm = normalize_title(h.group(1))
            if is_cover_noise(norm):
                continue
            start = h.end()
            end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
            content = text[start:end].strip()
            if len(content) < 20:  # stray/empty header (e.g. "##" inside a formula)
                continue
            sections.append(
                {"raw_title": h.group(1).strip(), "norm_title": norm, "content": content}
            )
        return sections

    enonce_sections = extract_sections(enonce_md)
    corrige_sections = extract_sections(corrige_md)

    paired = []
    unmatched_corrige = list(corrige_sections)

    for e in enonce_sections:
        match = next(
            (c for c in unmatched_corrige if c["norm_title"] == e["norm_title"]), None
        )
        confidence = "high"

        if not match:
            scored = [
                (c, title_similarity(e["norm_title"], c["norm_title"]))
                for c in unmatched_corrige
            ]
            scored.sort(key=lambda x: -x[1])
            if scored and scored[0][1] >= fuzzy_threshold:
                match, score = scored[0]
                confidence = f"fuzzy_{score:.2f}"

        if match:
            unmatched_corrige.remove(match)
            paired.append(
                {
                    "title": e["raw_title"],
                    "question_md": e["content"],
                    "correction_md": match["content"],
                    "confidence": confidence,
                }
            )
        else:
            # No corrigé counterpart — legitimate for preamble sections like "Problème"
            paired.append(
                {
                    "title": e["raw_title"],
                    "question_md": e["content"],
                    "correction_md": None,
                    "confidence": "preamble_or_needs_review",
                }
            )

    return paired, unmatched_corrige


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Split an extracted exam Markdown file into question/correction pairs."
    )
    parser.add_argument("path", help="Path to the extracted Markdown file")
    args = parser.parse_args()

    with open(args.path, encoding="utf-8") as f:
        md = f.read()
    paired, unmatched = split_document(md)
    for p in paired:
        print(f"[{p['confidence']:25s}] {p['title']}")
    print(f"\nUnmatched corrigé sections: {len(unmatched)}")
    for u in unmatched:
        print(" -", u["raw_title"])