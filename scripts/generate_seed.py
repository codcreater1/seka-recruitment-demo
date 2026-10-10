"""Generate fictional sample CVs (real PDF files) and seed/seed.json.

Run from the repository root:  python scripts/generate_seed.py
Requires: reportlab, pypdfium2 (only for the scanned sample).
All people, employers and contact data are fictional.
"""
import json
import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED_DIR = os.path.join(ROOT, "seed")
CV_DIR = os.path.join(SEED_DIR, "cv")
IN_DIR = os.path.join(SEED_DIR, "incoming")

FONT_CANDIDATES = [
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
]
for regular, bold in FONT_CANDIDATES:
    if os.path.exists(regular) and os.path.exists(bold):
        pdfmetrics.registerFont(TTFont("CV", regular))
        pdfmetrics.registerFont(TTFont("CV-Bold", bold))
        pdfmetrics.registerFontFamily("CV", normal="CV", bold="CV-Bold", italic="CV", boldItalic="CV-Bold")
        break
else:
    sys.exit("No TTF font with Polish characters found; edit FONT_CANDIDATES.")

POSITIONS = [
    "Specjalista ds. ochrony środowiska",
    "Technik laboratoryjny",
    "Konsultant ds. BHP",
    "Specjalista ds. pomiarów emisji",
    "Młodszy specjalista ds. raportowania",
    "Księgowy",
    "Praktykant",
]
UNI = {
    "Warszawa": "Politechnika Warszawska",
    "Kraków": "AGH w Krakowie",
    "Wrocław": "Politechnika Wrocławska",
    "Gdańsk": "Politechnika Gdańska",
    "Poznań": "Uniwersytet Przyrodniczy w Poznaniu",
    "Katowice": "Politechnika Śląska",
}
FIELD = [
    "Ochrona środowiska",
    "Biotechnologia",
    "Inżynieria środowiska",
    "Inżynieria środowiska",
    "Zarządzanie i inżynieria produkcji",
    "Rachunkowość i finanse",
    "Ochrona środowiska",
]
POSTAL = {"Warszawa": "00-%03d", "Kraków": "31-%03d", "Wrocław": "50-%03d", "Gdańsk": "80-%03d", "Poznań": "60-%03d", "Katowice": "40-%03d"}
STREETS = ["ul. Długa", "ul. Polna", "ul. Leśna", "ul. Słoneczna", "ul. Ogrodowa", "ul. Krótka", "ul. Lipowa", "ul. Spokojna"]
EMP = ["Ekoplan Sp. z o.o.", "Probus Laboratoria", "AquaTest Sp. z o.o.", "Zakład Usług Komunalnych", "Biuro Doradcze Zielona Linia", "Grupa Wodna Sp. z o.o."]
BULLETS = [
    ["Przygotowywanie raportów o oddziaływaniu na środowisko i wniosków o pozwolenia", "Prowadzenie ewidencji odpadów i rozliczanie opłat środowiskowych", "Kontakt z urzędami oraz klientami przemysłowymi"],
    ["Przygotowanie i analiza próbek wody oraz ścieków", "Obsługa chromatografu gazowego i spektrofotometru", "Prowadzenie dokumentacji zgodnie z normą PN-EN ISO/IEC 17025"],
    ["Opracowywanie ocen ryzyka zawodowego i instrukcji stanowiskowych", "Przeprowadzanie szkoleń wstępnych i okresowych BHP", "Audyty wewnętrzne i kontrole stanowisk pracy"],
    ["Pomiary emisji zanieczyszczeń do powietrza z emitorów", "Pobór próbek i opracowywanie sprawozdań z badań", "Praca w terenie we współpracy z zakładami przemysłowymi"],
    ["Przygotowywanie okresowych zestawień dla klientów", "Analiza danych pomiarowych w Excelu i Power BI", "Kontrola jakości danych przed przekazaniem klientowi"],
    ["Prowadzenie ksiąg rachunkowych i ewidencji VAT", "Rozliczanie wynagrodzeń i składek ZUS", "Przygotowywanie deklaracji podatkowych i sprawozdań finansowych"],
    ["Wsparcie zespołu w bieżących zadaniach", "Opracowanie zestawień danych i prezentacji"],
]
SKILLS = [
    ["Raportowanie środowiskowe", "Pozwolenia i decyzje", "MS Excel", "Język angielski B2"],
    ["Przygotowanie próbek", "Chromatografia", "Dokumentacja laboratoryjna", "Norma PN-EN ISO/IEC 17025"],
    ["Ocena ryzyka zawodowego", "Szkolenia BHP", "Audyty wewnętrzne", "Kodeks pracy"],
    ["Pomiary emisji do powietrza", "Pobór próbek", "Sprawozdania z badań", "Prawo jazdy kat. B"],
    ["Analiza danych", "Power BI", "MS Excel", "Raporty okresowe"],
    ["Księgi handlowe", "Faktury VAT", "Płace i ZUS", "Optima"],
    ["Pakiet Office", "Komunikatywność", "Chęć uczenia się", "Język angielski B1"],
]
CLAUSE = "Wyrażam zgodę na przetwarzanie moich danych osobowych w celu prowadzenia rekrutacji."
CLAUSE_FUTURE = " Wyrażam również zgodę na wykorzystanie danych w przyszłych rekrutacjach."

# name, city, position index, status, days ago, years of experience
CANDIDATES = [
    ("Anna Kowalczyk", "Warszawa", 0, "new", 0, 4),
    ("Piotr Zieliński", "Warszawa", 3, "screening", 2, 6),
    ("Katarzyna Wójcik", "Warszawa", 5, "interview", 6, 8),
    ("Dorota Jaworska", "Warszawa", 2, "new", 1, 6),
    ("Marcin Lewandowski", "Kraków", 1, "new", 1, 2),
    ("Joanna Kamińska", "Kraków", 2, "screening", 4, 5),
    ("Tomasz Dąbrowski", "Kraków", 0, "rejected", 12, 1),
    ("Magdalena Szymańska", "Wrocław", 4, "interview", 5, 3),
    ("Paweł Woźniak", "Wrocław", 1, "new", 0, 0),
    ("Ewa Jankowska", "Wrocław", 6, "screening", 3, 0),
    ("Michał Mazur", "Gdańsk", 3, "offer", 9, 7),
    ("Natalia Krawczyk", "Gdańsk", 0, "new", 1, 2),
    ("Karolina Piotrowska", "Gdańsk", 2, "hired", 21, 9),
    ("Jakub Grabowski", "Poznań", 5, "screening", 7, 4),
    ("Monika Pawłowska", "Poznań", 4, "rejected", 14, 1),
    ("Krzysztof Michalski", "Katowice", 3, "interview", 3, 10),
    ("Aleksandra Król", "Katowice", 6, "new", 0, 0),
    ("Rafał Wieczorek", "Katowice", 1, "rejected", 18, 3),
    ("Barbara Sikora", "Wrocław", 5, "rejected", 236, 6),
    ("Adam Czarnecki", "Warszawa", 1, "rejected", 201, 2),
]
NO_RODO = {7, 15}  # indexes whose CV has no consent clause
NOTES = {
    2: "Rozmowa telefoniczna: dostępna od 1 listopada, oczekiwania finansowe do omówienia.",
    5: "Doświadczenie w audytach u klientów produkcyjnych. Do rozmowy z kierownikiem oddziału.",
    7: "Dobre referencje. Termin rozmowy do uzgodnienia na przyszły tydzień.",
    10: "Oferta wysłana, czekamy na odpowiedź do piątku.",
    12: "Start pracy 2 listopada.",
    15: "Rozmowa z kierownikiem oddziału zaplanowana na czwartek.",
}
RATINGS = {"screening": 3, "interview": 4, "offer": 5, "hired": 5}
INTERVIEWS = {2: (2, "10:00"), 7: (4, "13:30"), 15: (3, "11:00")}  # index -> (days from now, time)

# not stored in the database; used for the upload / e-mail simulation
INCOMING = [
    ("Weronika Adamska", "Kraków", 1, 2, True, "text"),
    ("Łukasz Sadowski", "Gdańsk", 3, 5, True, "text"),
    ("Izabela Nowicka", "Wrocław", 0, 3, False, "text"),
    ("Bartosz Kaczmarek", "Poznań", 2, 4, True, "text"),
    ("Julia Maciejewska", "Katowice", 4, 1, True, "scan"),
]


def slug(text: str) -> str:
    table = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
    out = text.translate(table).lower()
    return "".join(ch if ch.isalnum() else ("." if ch == " " else "") for ch in out)


def file_slug(text: str) -> str:
    return slug(text).replace(".", "_")


def phone_for(i: int) -> str:
    return "+48 5%d0 %03d %03d" % (i % 9 + 1, 120 + i * 17, (300 + i * 29) % 1000)


def build_cv_pdf(path, name, city, pos, years, i, rodo, future_consent=False):
    h1 = ParagraphStyle("h1", fontName="CV-Bold", fontSize=22, leading=26, textColor=colors.HexColor("#14201B"))
    head = ParagraphStyle("head", fontName="CV", fontSize=12.5, leading=16, textColor=colors.HexColor("#1D6A4D"))
    base = ParagraphStyle("base", fontName="CV", fontSize=10, leading=14)
    small = ParagraphStyle("small", parent=base, fontSize=9, leading=12, textColor=colors.HexColor("#555555"))
    sec = ParagraphStyle("sec", fontName="CV-Bold", fontSize=10, leading=14, textColor=colors.HexColor("#1D6A4D"), spaceBefore=12, spaceAfter=4)
    bullet = ParagraphStyle("bullet", parent=base, leftIndent=12, bulletIndent=2)

    street = "%s %d/%d" % (STREETS[i % len(STREETS)], 3 + i * 2 % 40, 1 + i % 12)
    postal = POSTAL[city] % (10 + i * 7 % 90)
    email = slug(name) + "@example.com"
    story = []
    if i % 2 == 0:
        story.append(Paragraph("Curriculum Vitae", small))
    story += [
        Paragraph(name, h1),
        Paragraph(POSITIONS[pos], head),
        Spacer(1, 6),
        Paragraph("%s, %s %s" % (street, postal, city), base),
        Paragraph("E-mail: %s" % email, base),
        Paragraph("Tel.: %s" % phone_for(i), base),
    ]
    goal = {
        0: "Szukam pracy przy projektach z zakresu ochrony środowiska i dokumentacji środowiskowej.",
        1: "Chcę rozwijać się w akredytowanym laboratorium badawczym.",
        2: "Interesuje mnie praca przy audytach i szkoleniach z zakresu bezpieczeństwa pracy.",
        3: "Chcę pracować przy pomiarach emisji i badaniach terenowych.",
        4: "Chcę rozwijać się w analizie danych i raportowaniu dla klientów.",
        5: "Szukam stabilnej pracy w dziale księgowości.",
        6: "Szukam praktyk, aby poznać pracę w firmie z branży ochrony środowiska.",
    }[pos]
    story += [Paragraph("CEL ZAWODOWY", sec), Paragraph(goal, base), Paragraph("DOŚWIADCZENIE ZAWODOWE", sec)]
    start = 2026 - years
    if years:
        story.append(Paragraph("<b>%s</b>, %s" % (POSITIONS[pos], EMP[i % len(EMP)]), base))
        story.append(Paragraph("%d – obecnie" % (start + min(2, years - 1)), small))
        for b in BULLETS[pos]:
            story.append(Paragraph(b, bullet, bulletText="•"))
        if years >= 3:
            story.append(Spacer(1, 6))
            story.append(Paragraph("<b>Asystent / stażysta</b>, %s" % EMP[(i + 2) % len(EMP)], base))
            story.append(Paragraph("%d – %d" % (start, start + min(2, years - 1)), small))
            story.append(Paragraph(BULLETS[pos][0], bullet, bulletText="•"))
    else:
        story.append(Paragraph("<b>Praktyka zawodowa</b>, %s" % EMP[i % len(EMP)], base))
        story.append(Paragraph("lipiec – wrzesień 2025", small))
        story.append(Paragraph(BULLETS[pos][-1], bullet, bulletText="•"))
    story += [
        Paragraph("WYKSZTAŁCENIE", sec),
        Paragraph("<b>%s</b>, %s" % (FIELD[pos], UNI[city]), base),
        Paragraph("studia magisterskie, %s" % ("ukończone" if years else "w trakcie"), small),
        Paragraph("UMIEJĘTNOŚCI", sec),
        Paragraph(", ".join(SKILLS[pos]), base),
    ]
    if rodo:
        story += [Spacer(1, 18), Paragraph(CLAUSE + (CLAUSE_FUTURE if future_consent else ""), small)]
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title="CV " + name, author=name)
    doc.build(story)


def make_scan(src_pdf, dst_pdf):
    import pypdfium2 as pdfium
    from reportlab.pdfgen import canvas
    img = pdfium.PdfDocument(src_pdf)[0].render(scale=1.6).to_pil().convert("L")
    tmp = dst_pdf + ".png"
    img.save(tmp)
    c = canvas.Canvas(dst_pdf, pagesize=A4)
    c.drawImage(tmp, 0, 0, width=A4[0], height=A4[1])
    c.save()
    os.remove(tmp)


def main():
    os.makedirs(CV_DIR, exist_ok=True)
    os.makedirs(IN_DIR, exist_ok=True)
    out = {"candidates": [], "incoming": []}
    for i, (name, city, pos, status, days, years) in enumerate(CANDIDATES):
        cid = "seed-%02d" % i
        rodo = i not in NO_RODO
        fname = "%s.pdf" % cid
        build_cv_pdf(os.path.join(CV_DIR, fname), name, city, pos, years, i, rodo, future_consent=(i % 4 == 0))
        out["candidates"].append({
            "id": cid, "name": name, "city": city, "position": POSITIONS[pos], "status": status,
            "daysAgo": days, "years": years, "email": slug(name) + "@example.com", "phone": phone_for(i),
            "subject": ("Aplikacja – %s (%s)" % (POSITIONS[pos], city)) if i % 3 == 1 else "Aplikacja na stanowisko: %s" % POSITIONS[pos],
            "cityBasis": ["ogłoszenia (wybrane stanowisko)", "tytułu wiadomości", "adresu w CV"][i % 3],
            "rodo": rodo, "file": "cv/" + fname, "downloadName": "CV_%s.pdf" % file_slug(name),
            "rating": RATINGS.get(status), "note": NOTES.get(i),
            "interview": ({"inDays": INTERVIEWS[i][0], "time": INTERVIEWS[i][1]} if i in INTERVIEWS else None),
        })
    for j, (name, city, pos, years, rodo, kind) in enumerate(INCOMING):
        i = 100 + j
        fname = "CV_%s.pdf" % file_slug(name)
        path = os.path.join(IN_DIR, fname)
        if kind == "scan":
            tmp = path + ".src.pdf"
            build_cv_pdf(tmp, name, city, pos, years, i, rodo)
            make_scan(tmp, path)
            os.remove(tmp)
        else:
            build_cv_pdf(path, name, city, pos, years, i, rodo)
        out["incoming"].append({
            "name": name, "file": "incoming/" + fname, "downloadName": fname, "kind": kind,
            "from": slug(name) + "@example.com",
            "subject": "Aplikacja – %s (%s)" % (POSITIONS[pos], city) if j % 2 == 0 else "Aplikacja na stanowisko: %s" % POSITIONS[pos],
        })
    with open(os.path.join(SEED_DIR, "seed.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("generated %d CVs, %d incoming samples" % (len(out["candidates"]), len(out["incoming"])))


if __name__ == "__main__":
    main()
