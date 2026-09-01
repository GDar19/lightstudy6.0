"""Generate a Cyrillic test PDF for KB/RAG E2E testing (needs a Unicode TTF)."""
import glob

from fpdf import FPDF

CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
]
font_path = None
for c in CANDIDATES:
    if glob.glob(c):
        font_path = c
        break
if not font_path:
    found = glob.glob("/usr/share/fonts/**/*.ttf", recursive=True)
    font_path = next((f for f in found if "Liberation" in f or "Noto" in f or "DejaVu" in f), found[0])
print("using font:", font_path)

LINES = [
    "Производная функции (ЕГЭ, математика профиль, 11 класс)",
    "",
    "Производная функции показывает скорость изменения функции в точке.",
    "Геометрический смысл производной — тангенс угла наклона касательной.",
    "Производная степенной функции: (x^n)' = n * x^(n-1).",
    "Производная синуса равна косинусу, производная косинуса равна минус синусу.",
    "В точке экстремума производная функции обращается в нуль: f'(x) = 0.",
    "Если производная положительна, функция возрастает; если отрицательна — убывает.",
    "",
    "Задание ЕГЭ: найдите точку максимума функции y = x^3 - 3x.",
    "Решение: y' = 3x^2 - 3 = 0, откуда x = -1 — точка максимума.",
    "Интегрирование является операцией, обратной дифференцированию.",
]

pdf = FPDF()
pdf.add_page()
pdf.add_font("uni", "", font_path)
pdf.set_font("uni", size=12)
for ln in LINES:
    pdf.cell(0, 8, ln, new_x="LMARGIN", new_y="NEXT")
out = "/app/test_reports/sample_derivative_ru.pdf"
pdf.output(out)
print("written", out)
