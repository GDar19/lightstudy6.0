"""Multimodal analysis of student extended-response (Part 2) solutions.
Sends the student's uploaded image(s) of a handwritten solution (+ optional typed answer)
to a multimodal model together with the task, expected solution and EGE scoring criteria,
and returns a structured, subject-aware, per-criterion evaluation (AI-assisted, NOT official)."""
import json

from ai_service import _ask, ai_available
import media_service

# Subject-specific analysis guidance (extensible)
SUBJECT_GUIDE = {
    "math_prof": "Проверяй математическую строгость: формулы, преобразования, вычисления, доказательства, геометрические построения, графики, логику рассуждений и ОДЗ.",
    "math_base": "Проверяй вычисления, применение формул и логику решения.",
    "phys": "Проверяй формулы, единицы измерения (СИ), вычисления, физический смысл, схемы и графики.",
    "chem": "Проверяй уравнения реакций, расстановку коэффициентов, цепочки превращений, расчёты и химическую нотацию.",
    "bio": "Проверяй биологическую терминологию, полноту развёрнутого ответа, трактовку схем/рисунков и таблиц.",
    "rus": "Проверяй структуру сочинения, аргументацию, соответствие теме, логику, а также орфографические, пунктуационные и речевые ошибки.",
    "lit": "Проверяй знание текста, аргументацию, использование литературоведческих терминов и логику сочинения.",
    "soc": "Проверяй раскрытие понятий, аргументы, примеры и структуру развёрнутого ответа.",
    "hist": "Проверяй фактическую точность, причинно-следственные связи, использование терминов и дат.",
    "eng": "Проверяй структуру, грамматику, лексику, связность и решение коммуникативной задачи.",
    "geo": "Проверяй работу с картами/данными, расчёты и географическую аргументацию.",
    "inf": "Проверяй корректность алгоритма/кода, логику, крайние случаи и трассировку.",
}

SYSTEM = (
    "Ты — опытный эксперт-проверяющий ЕГЭ и доброжелательный репетитор Фили. "
    "Тебе дают задание части 2 ЕГЭ, ожидаемое решение и критерии оценивания, а также ФОТО рукописного "
    "решения ученика (и, возможно, набранный текст). Внимательно рассмотри изображение: распознай записанные "
    "шаги, математическую/научную нотацию, чертежи и графики. Проанализируй ПРОЦЕСС решения, а не только "
    "итоговый ответ: где рассуждение верное, где допущена первая содержательная ошибка, что упущено. "
    "Оцени по каждому критерию и оцени суммарный балл. Будь честен и конкретен, но поддерживай ученика. "
    "Это ИИ-оценка для тренировки, НЕ официальная проверка эксперта — обязательно упомяни это в feedback. "
    "Не используй LaTeX; формулы записывай обычными символами Юникода."
)


def _criteria_block(scoring: dict) -> str:
    if not scoring or not scoring.get("criteria"):
        return "Критерии не заданы — оцени решение целостно и предложи разумную максимальную оценку."
    lines = [f"Максимальный балл: {scoring.get('max_score', len(scoring['criteria']))}."]
    for i, c in enumerate(scoring["criteria"], start=1):
        lines.append(f"Критерий {i}: «{c.get('title','')}» (макс. {c.get('max',1)} б.) — {c.get('description','')}")
    return "\n".join(lines)


async def analyze_solution(session_id: str, task: dict, images_b64: list, typed_answer: str, subject_id: str) -> dict:
    if not ai_available():
        return None
    guide = SUBJECT_GUIDE.get(subject_id, "Проверяй логику, полноту и корректность решения.")
    scoring = task.get("scoring") or {}
    max_score = scoring.get("max_score") or (len(scoring.get("criteria", [])) or 2)
    typed = f"\nНабранный ответ ученика (в дополнение к фото): {typed_answer}" if typed_answer else ""
    solution = f"\nОжидаемое/эталонное решение: {task.get('solution')}" if task.get("solution") else ""
    prompt = (
        f"ПРЕДМЕТ: акцент — {guide}\n"
        f"ЗАДАНИЕ (часть 2): {task.get('question','')}\n"
        f"{solution}\n"
        f"КРИТЕРИИ ОЦЕНИВАНИЯ:\n{_criteria_block(scoring)}\n"
        f"{typed}\n\n"
        "Проанализируй фото рукописного решения ученика и верни СТРОГО валидный JSON без пояснений и markdown:\n"
        '{"criteria":[{"title":"...","status":"satisfied|partial|not","points":0,"max":1,"comment":"..."}],'
        '"total_score":0,"max_score":' + str(max_score) + ','
        '"correct_parts":["..."],"missing_parts":["..."],"first_error":"...","feedback":"..."}\n'
        "status: satisfied — критерий выполнен, partial — частично, not — не выполнен. "
        "points — присуждённые баллы по критерию (0..max). total_score — сумма баллов. "
        "first_error — где именно допущена первая содержательная ошибка (или пустая строка, если ошибок нет). "
        "feedback — короткая поддерживающая обратная связь с указанием, что улучшить, и пометкой, что это ИИ-оценка."
    )
    raw = await _ask(session_id, SYSTEM, prompt, images_b64)
    if not raw:
        return None
    parsed = _extract_json(raw)
    if not parsed:
        return {"raw": raw, "criteria": [], "total_score": None, "max_score": max_score,
                "feedback": raw[:1500], "first_error": "", "correct_parts": [], "missing_parts": []}
    parsed.setdefault("max_score", max_score)
    return parsed


def _extract_json(raw: str) -> dict:
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            return None
        return json.loads(raw[start:end + 1])
    except Exception:
        return None
