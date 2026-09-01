"""Provider-agnostic AI service layer for LightStudy.
Uses emergentintegrations LlmChat. Configured provider/model via env, defaults to Claude.
Falls back gracefully (returns None) when no key is configured — callers must handle it.
"""
import os
import json

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    _LIB_OK = True
except Exception:
    _LIB_OK = False

AI_PROVIDER = os.environ.get("AI_PROVIDER", "anthropic")
AI_MODEL = os.environ.get("AI_MODEL", "claude-sonnet-4-6")

TUTOR_PERSONA = (
    "Ты — Фили, дружелюбный ИИ-репетитор платформы LightStudy для подготовки к ЕГЭ. "
    "Ты объясняешь понятно, простым языком, подходящим для школьника 15-18 лет. "
    "Ты избегаешь лишнего жаргона, приводишь примеры, даёшь подсказки перед готовым ответом, "
    "поощряешь ученика и мягко исправляешь ошибки. "
    "Ты не выдаёшь придуманные факты за официальные требования ЕГЭ и советуешь сверяться с официальной спецификацией ЕГЭ по точным правилам экзамена. "
    "Сгенерированные тобой задания помечай как тренировочные, а не официальные вопросы ЕГЭ. "
    "Отвечай на русском языке. Форматируй кратко и структурированно."
)


def ai_available() -> bool:
    return _LIB_OK and bool(os.environ.get("EMERGENT_LLM_KEY"))


def _key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


async def _ask(session_id: str, system_message: str, prompt: str) -> str:
    if not ai_available():
        return None
    chat = LlmChat(api_key=_key(), session_id=session_id, system_message=system_message).with_model(AI_PROVIDER, AI_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    return resp if isinstance(resp, str) else str(resp)


class AIService:
    @staticmethod
    async def generate_answer(session_id: str, user_text: str, context: dict = None, history: list = None) -> str:
        ctx = _format_context(context)
        transcript = _format_history(history)
        prompt = f"{ctx}\n\n{transcript}\nУченик: {user_text}\n\nОтветь как заботливый репетитор."
        return await _ask(session_id, TUTOR_PERSONA, prompt)

    @staticmethod
    async def explain_topic(session_id: str, topic_name: str, subject_name: str, mastery: int = None, mode: str = "default") -> str:
        mastery_note = f" Текущий уровень ученика по теме: {mastery}%." if mastery is not None else ""
        mode_map = {
            "simple": "Объясни максимально простыми словами и короче.",
            "example": "Объясни на конкретном примере с решением.",
            "analogy": "Объясни через наглядную аналогию из жизни.",
            "summary": "Сделай краткий конспект (5-7 тезисов).",
            "default": "Дай понятное объяснение с одним примером и проверочным вопросом в конце.",
        }
        prompt = (
            f"Тема: «{topic_name}» по предмету «{subject_name}».{mastery_note}\n"
            f"{mode_map.get(mode, mode_map['default'])}"
        )
        return await _ask(session_id, TUTOR_PERSONA, prompt)

    @staticmethod
    async def generate_question(session_id: str, topic_name: str, subject_name: str, difficulty: str = "medium") -> dict:
        prompt = (
            f"Сгенерируй ОДНО тренировочное задание по теме «{topic_name}» ({subject_name}), "
            f"уровень сложности: {difficulty}. Верни СТРОГО валидный JSON без пояснений в формате: "
            '{"question": "...", "options": ["A","B","C","D"], "answer": 0, "explanation": "..."}. '
            "answer — индекс правильного варианта (0-3). Пометь, что это тренировочное задание."
        )
        raw = await _ask(session_id, TUTOR_PERSONA, prompt)
        if not raw:
            return None
        return _extract_json(raw)

    @staticmethod
    async def analyze_answer(session_id: str, question: str, student_answer: str, correct_answer: str = None) -> str:
        correct_note = f"\nПравильный ответ: {correct_answer}." if correct_answer else ""
        prompt = (
            f"Задание: {question}\nОтвет ученика: {student_answer}.{correct_note}\n"
            "Проанализируй решение ученика: верно ли, где ошибка, как исправить. Дай короткую обратную связь и подсказку."
        )
        return await _ask(session_id, TUTOR_PERSONA, prompt)

    @staticmethod
    async def create_lesson(session_id: str, topic_name: str, subject_name: str) -> str:
        prompt = (
            f"Составь краткий план урока по теме «{topic_name}» ({subject_name}): "
            "объяснение, 2 ключевых момента, пример и один проверочный вопрос. Кратко."
        )
        return await _ask(session_id, TUTOR_PERSONA, prompt)


def _format_context(context: dict) -> str:
    if not context:
        return ""
    parts = ["Контекст об ученике:"]
    if context.get("name"):
        parts.append(f"- Имя: {context['name']}")
    if context.get("subject_name"):
        parts.append(f"- Предмет: {context['subject_name']}")
    if context.get("topic_name"):
        parts.append(f"- Тема: {context['topic_name']}")
    if context.get("mastery") is not None:
        parts.append(f"- Уровень по теме: {context['mastery']}%")
    if context.get("target_score"):
        parts.append(f"- Целевой балл: {context['target_score']}")
    if context.get("weak_topics"):
        parts.append(f"- Слабые темы: {', '.join(context['weak_topics'])}")
    return "\n".join(parts)


def _format_history(history: list) -> str:
    if not history:
        return ""
    lines = []
    for m in history[-6:]:
        role = "Ученик" if m.get("role") == "user" else "Фили"
        lines.append(f"{role}: {m.get('content', '')}")
    return "\n".join(lines)


def _extract_json(raw: str) -> dict:
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            return None
        return json.loads(raw[start:end + 1])
    except Exception:
        return None
