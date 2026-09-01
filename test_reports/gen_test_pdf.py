from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Helvetica", size=12)
lines = [
    "Derivative of a function (EGE Mathematics, grade 11)",
    "",
    "The derivative f'(x) measures the instantaneous rate of change of f(x).",
    "For a power function f(x) = x^n, the derivative is f'(x) = n*x^(n-1).",
    "The derivative of sin(x) is cos(x); the derivative of cos(x) is -sin(x).",
    "At an extremum point the derivative equals zero: f'(x) = 0.",
    "Increasing intervals correspond to f'(x) > 0, decreasing to f'(x) < 0.",
    "",
    "Example EGE task: find the point of maximum of y = x^3 - 3x.",
    "Solution: y' = 3x^2 - 3 = 0 => x = -1 gives the maximum.",
]
for ln in lines:
    pdf.cell(0, 8, ln, ln=1)
pdf.output("/app/test_reports/sample_derivative.pdf")
print("written")
