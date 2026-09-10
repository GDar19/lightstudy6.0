"""Answer grading for all supported question types + difficulty weighting."""

DIFFICULTY_ORDER = ["easy", "medium", "hard", "ege"]
DIFFICULTY_LEVEL = {"easy": 2, "medium": 3, "hard": 4, "ege": 5}
DIFFICULTY_WEIGHT = {"easy": 1, "medium": 2, "hard": 3.2, "ege": 4.2}
# a topic can't be considered mastered if the student only ever solves easy items
DIFFICULTY_CEILING = {"easy": 45, "medium": 70, "hard": 88, "ege": 100}

# Task types that are auto-gradeable objectively
AUTO_GRADED = {
    "single_choice", "true_false", "multiple_choice", "numeric", "text",
    "matching", "ordering", "table_completion",
    "graph_analysis", "diagram_analysis", "image_analysis",
}
# Extended written responses need AI/human evaluation (not a simple right/wrong)
EXTENDED_TYPES = {"extended_response"}


def _norm(s):
    return str(s).strip().lower().replace(",", ".").replace(" ", "").replace("ё", "е")


def is_auto_graded(q: dict) -> bool:
    t = q.get("type", "single_choice")
    # graph/diagram/image analysis carry images but resolve to an underlying answer format
    return t in AUTO_GRADED


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
        if t == "matching":
            # submitted & q["match_answer"] are lists: right-index chosen for each left item
            ans = q.get("match_answer") or []
            sub = submitted or []
            if len(ans) != len(sub):
                return False
            return all(int(a) == int(s) for a, s in zip(ans, sub))
        if t == "ordering":
            ans = q.get("order_answer") or []
            sub = submitted or []
            return [int(x) for x in sub] == [int(x) for x in ans]
        if t == "table_completion":
            # submitted & q["table_answer"] are lists of expected cell strings (in blank order)
            ans = q.get("table_answer") or []
            sub = submitted or []
            if len(ans) != len(sub):
                return False
            return all(_norm(s) == _norm(a) for s, a in zip(sub, ans))
        if t in ("graph_analysis", "diagram_analysis", "image_analysis"):
            # underlying answer stored the same way as choice/numeric/text via answer_format
            fmt = q.get("answer_format", "single_choice")
            proxy = dict(q)
            proxy["type"] = fmt
            return check_answer(proxy, submitted)
    except Exception:
        return False
    return str(submitted) == str(q.get("answer"))
