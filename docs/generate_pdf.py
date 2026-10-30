import argparse
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def inline(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"<font name='Courier-Bold'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", text)
    return text.replace("&", "&amp;")


def markdown_table(rows: list[str]) -> Table:
    parsed = []
    for row in rows:
        cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
        parsed.append([Paragraph(inline(cell), table_style) for cell in cells])
    widths = [A4[0] / max(1, len(parsed[0])) - 8 * mm] * len(parsed[0])
    table = Table(parsed, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("LEADING", (0, 0), (-1, -1), 10),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bbbbbb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    return table


base = getSampleStyleSheet()
styles = {
    "body": ParagraphStyle("body", parent=base["BodyText"], fontSize=9, leading=13, spaceAfter=4),
    "h1": ParagraphStyle("h1", parent=base["Heading1"], fontSize=20, textColor=colors.HexColor("#1a1a2e"), spaceBefore=12, spaceAfter=6),
    "h2": ParagraphStyle("h2", parent=base["Heading2"], fontSize=15, textColor=colors.HexColor("#16213e"), spaceBefore=10, spaceAfter=5),
    "h3": ParagraphStyle("h3", parent=base["Heading3"], fontSize=12, textColor=colors.HexColor("#0f3460"), spaceBefore=8, spaceAfter=4),
    "code": ParagraphStyle("code", parent=base["Code"], fontSize=7.5, leading=10, backColor=colors.HexColor("#f4f4f4"), leftIndent=6, rightIndent=6),
}
table_style = ParagraphStyle(
    "table", parent=base["BodyText"], fontSize=8, leading=10, alignment=TA_LEFT
)


def build_pdf(markdown_path: Path, output_path: Path) -> None:
    story = []
    lines = markdown_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            story.append(Spacer(1, 3))
            i += 1
            continue
        if line.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            story.append(Preformatted("\n".join(code_lines), styles["code"]))
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?[\s:|-]+\|", lines[i + 1]):
            rows = [line]
            i += 2
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            story.append(markdown_table(rows))
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:].strip()), styles["h1"]))
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:].strip()), styles["h2"]))
        elif line.startswith("### "):
            story.append(Paragraph(inline(line[4:].strip()), styles["h3"]))
        elif line.startswith("---"):
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=5))
        elif re.match(r"^- \*\*|^\- ", line):
            story.append(Paragraph("• " + inline(line.lstrip("- ").strip()), styles["body"]))
        elif re.match(r"^\d+\. ", line):
            story.append(Paragraph(inline(line), styles["body"]))
        else:
            story.append(Paragraph(inline(line), styles["body"]))
        i += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    title = lines[0][2:].strip() if lines and lines[0].startswith("# ") else "Azentio.ai API Documentation"
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=title,
        author="Azentio.ai Backend",
    )
    doc.build(story)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a readable PDF from API Markdown")
    parser.add_argument("markdown", nargs="?", default="docs/api_documentation.md")
    parser.add_argument("output", nargs="?")
    args = parser.parse_args()
    markdown_path = Path(args.markdown)
    output_path = Path(args.output) if args.output else markdown_path.with_suffix(".pdf")
    build_pdf(markdown_path, output_path)


if __name__ == "__main__":
    main()
