"""Answer grading for all supported question types + difficulty weighting."""

DIFFICULTY_ORDER = ["easy", "medium", "hard", "ege"]
DIFFICULTY_LEVEL = {"easy": 2, "medium": 3, "hard": 4, "ege": 5}
DIFFICULTY_WEIGHT = {"easy": 1, "medium": 2, "hard": 3.2, "ege": 4.2}
# a topic can't be considered mastered if the student only ever solves easy items
DIFFICULTY_CEILING = {"easy": 45, "medium": 70, "hard": 88, "ege": 100}


def _norm(s):
    return str(s).strip().lower().replace(",", ".").replace(" ", "").replace("ё", "е")


def check_answer(q: dict, submitted) -> bool:
    t = q.get("type", "single_choice")
    try:
        if t in ("single_choice", "true_false"):
            return int(submitted) == int(q["answer"])
        if t == "multiple_choice":
            return sorted(int(x) for x in submitted) == sorted(int(x) for x in q["answer"])
        if t == "numeric":
            try:
                return abs(float(_norm(submitted)) - float(_norm(q.get("answer_value")))) < 1e-6
            except Exception:
                return _norm(submitted) == _norm(q.get("answer_value"))
        if t == "text":
            acc = q.get("answer_value")
            accepted = acc if isinstance(acc, list) else [acc]
            return _norm(submitted) in [_norm(a) for a in accepted]
    except Exception:
        return False
    return str(submitted) == str(q.get("answer"))
