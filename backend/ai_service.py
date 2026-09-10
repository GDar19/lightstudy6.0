"""Provider-agnostic AI service layer for LightStudy.
Uses emergentintegrations LlmChat. Configured provider/model via env, defaults to Claude.
Falls back gracefully (returns None) when no key is configured — callers must handle it.
"""
import os
import json

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    _LIB_OK = True
except Exception:
    _LIB_OK = False

AI_PROVIDER = os.environ.get("AI_PROVIDER", "gemini")
AI_MODEL = os.environ.get("AI_MODEL", "gemini-3-flash-preview")

TUTOR_PERSONA = (
    "Ты — Фили, дружелюбный ИИ-репетитор платформы LightStudy для подготовки к ЕГЭ. "
    "Ты объясняешь понятно, простым языком, подходящим для школьника 15-18 лет. "
    "ГЛАВНОЕ ПРАВИЛО: ты работаешь как настоящий репетитор, а НЕ как генератор готовых ответов. "
    "Когда ученик просит помощь с задачей, действуй пошагово: "
    "1) определи, в чём именно затруднение; 2) дай наводящую подсказку и направление решения; "
    "3) задай ученику контрольный вопрос; 4) если ученик всё ещё не понимает — объясни подробнее; "
    "5) полное решение показывай только когда это действительно необходимо. "
    "Не выдавай итоговый ответ сразу, если ученик просит помочь разобраться. "
    "Приводи примеры, поощряй ученика и мягко исправляй ошибки, ориентируйся на уровень ЕГЭ. "
    "Не выдавай придуманные факты за официальные требования ЕГЭ и советуй сверяться с официальной спецификацией. "
    "Сгенерированные задания помечай как тренировочные. Отвечай на русском, кратко и структурированно. "
    "НЕ используй LaTeX и разметку формул (никаких $...$, \\(...\\), \\[...\\], \\cdot, \\frac, \\sqrt). "
    "Записывай формулы обычными символами Юникода: умножение ·, степень ² ³, корень √, дробь как a/b, ≤ ≥ ≈."
)


def ai_available() -> bool:
    return _LIB_OK and bool(os.environ.get("EMERGENT_LLM_KEY"))


def _key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


async def _ask(session_id: str, system_message: str, prompt: str, images: list = None) -> str:
    if not ai_available():
        return None
    chat = LlmChat(api_key=_key(), session_id=session_id, system_message=system_message).with_model(AI_PROVIDER, AI_MODEL)
    file_contents = [ImageContent(image_base64=b) for b in (images or []) if b]
    msg = UserMessage(text=prompt, file_contents=file_contents) if file_contents else UserMessage(text=prompt)
    resp = await chat.send_message(msg)
    return resp if isinstance(resp, str) else str(resp)


class AIService:
    @staticmethod
    async def generate_answer(session_id: str, user_text: str, context: dict = None, history: list = None, images: list = None) -> str:
        ctx = _format_context(context)
        transcript = _format_history(history)
        img_note = ("\n\nК сообщению приложены изображения (рисунок из задания и/или иллюстрации из учебника). "
                    "Обязательно посмотри на них и опирайся на то, что на них изображено.") if images else ""
        prompt = f"{ctx}\n\n{transcript}\nУченик: {user_text}{img_note}\n\nОтветь как заботливый репетитор."
        return await _ask(session_id, TUTOR_PERSONA, prompt, images)

    @staticmethod
    async def explain_topic(session_id: str, topic_name: str, subject_name: str, mastery: int = None, mode: str = "default", source_material: str = "", images: list = None) -> str:
        mastery_note = f" Текущий уровень ученика по теме: {mastery}%." if mastery is not None else ""
        mode_map = {
            "simple": "Объясни максимально простыми словами и короче.",
            "example": "Объясни на конкретном примере с решением.",
            "analogy": "Объясни через наглядную аналогию из жизни.",
            "summary": "Сделай краткий конспект (5-7 тезисов).",
            "default": "Дай понятное объяснение с одним примером и проверочным вопросом в конце.",
        }
        material = f"\n\n{source_material}" if source_material else ""
        img_note = ("\n\nК теме приложены иллюстрации из учебника — используй их в объяснении.") if images else ""
        prompt = (
            f"Тема: «{topic_name}» по предмету «{subject_name}».{mastery_note}\n"
            f"{mode_map.get(mode, mode_map['default'])}{material}{img_note}"
        )
        return await _ask(session_id, TUTOR_PERSONA, prompt, images)

    @staticmethod
    async def generate_question(session_id: str, topic_name: str, subject_name: str, difficulty: str = "medium", source_material: str = "", images: list = None) -> dict:
        material = f"\n\n{source_material}\n" if source_material else ""
        img_note = ("К материалам приложены иллюстрации из учебника — можешь опираться на них.\n") if images else ""
        prompt = (
            f"Сгенерируй ОДНО тренировочное задание уровня ЕГЭ по теме «{topic_name}» ({subject_name}), "
            f"сложность: {difficulty}. Задание должно соответствовать формату, терминологии и уровню реального ЕГЭ, "
            f"НЕ быть элементарным или общим, требовать применения знаний (возможно, нескольких шагов).{material}{img_note}"
            "Верни СТРОГО валидный JSON без пояснений: "
            '{"question": "...", "options": ["A","B","C","D"], "answer": 0, "explanation": "..."}. '
            "answer — индекс правильного варианта (0-3). Это тренировочное задание, не официальный вопрос ЕГЭ."
        )
        raw = await _ask(session_id, TUTOR_PERSONA, prompt, images)
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
    if context.get("lesson_title"):
        parts.append(f"- Текущий урок: {context['lesson_title']}")
    if context.get("problem"):
        parts.append(f"- Задача/пример, с которым работает ученик: {context['problem']}")
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
