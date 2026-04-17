#!/usr/bin/env python3
"""Generate 40 realistic HR documents (PDFs) for demo purposes."""

import os
import random
from datetime import datetime, timedelta
from fpdf import FPDF

OUT_DIR = os.path.join(os.path.dirname(__file__), "mock-docs")
os.makedirs(OUT_DIR, exist_ok=True)

# ── Data pools ────────────────────────────────────────────────────────────────
DOCTORS = [
    ("Dr. Sarah Johnson", "MD, Internal Medicine"),
    ("Dr. Michael Chen", "MD, Family Practice"),
    ("Dr. Priya Patel", "MD, General Medicine"),
    ("Dr. James Wilson", "DO, Occupational Health"),
    ("Dr. Emily Rodriguez", "MD, Emergency Medicine"),
    ("Dr. Robert Kim", "MD, Psychiatry"),
    ("Dr. Lisa Thompson", "MD, Orthopedics"),
    ("Dr. David Martinez", "MD, Pulmonology"),
    ("Dr. Amanda Foster", "MD, Neurology"),
    ("Dr. Kevin O'Brien", "DO, Sports Medicine"),
]

HOSPITALS = [
    "Metro General Hospital",
    "City Medical Center",
    "St. Mary's Hospital",
    "Valley Health Clinic",
    "Pacific Medical Group",
    "Stanford Health Partners",
    "Bay Area Medical Center",
    "Community Health Network",
    "Sunrise Medical Associates",
    "Golden Gate Healthcare",
]

EMPLOYEES = [
    "Roma Lakhwani", "James Okafor", "Sarah Chen", "Marcus Reid",
    "Emily Watson", "John Park", "Aisha Patel", "Carlos Hernandez",
    "Olivia Foster", "David Kim", "Sophia Martinez", "Alex Johnson",
    "Priya Singh", "Ryan Thompson", "Hannah Lee",
]

DIAGNOSES_SICK = [
    ("Acute Respiratory Infection", "Rest and antibiotics prescribed"),
    ("Viral Gastroenteritis", "Hydration and rest recommended"),
    ("Severe Migraine", "Medication prescribed, avoid screens"),
    ("Lower Back Strain", "Physical therapy recommended"),
    ("Influenza Type A", "Antiviral medication prescribed"),
    ("Acute Bronchitis", "Rest and cough suppressant prescribed"),
    ("Stress-related Exhaustion", "Complete rest advised"),
    ("Dental Surgery Recovery", "Soft diet and rest for recovery"),
    ("Allergic Reaction", "Antihistamines and monitoring"),
    ("Sprained Ankle", "RICE protocol and limited mobility"),
]

DIAGNOSES_FMLA = [
    ("Chronic Lower Back Condition", "Ongoing physical therapy required"),
    ("Major Depressive Disorder", "Psychiatric treatment and counseling"),
    ("Post-Surgical Recovery  - Knee", "6-week rehabilitation program"),
    ("Chronic Fatigue Syndrome", "Ongoing medical management"),
    ("Recurring Cardiac Arrhythmia", "Cardiology follow-up required"),
    ("Fibromyalgia", "Pain management and rest periods"),
    ("Crohn's Disease Flare", "Gastroenterology treatment plan"),
    ("Anxiety Disorder with Panic", "Psychiatric treatment required"),
]

BABY_NAMES = ["Aria", "Noah", "Luna", "Liam", "Maya", "Ethan", "Zara", "Oliver", "Ava", "Leo"]

DECEASED_NAMES = ["Robert Johnson Sr.", "Margaret Chen", "William Patel", "Dorothy Foster", "James Reid Sr."]
DECEASED_RELATIONS = ["Father", "Mother", "Grandfather", "Grandmother", "Spouse"]


def rand_date(start_offset=-30, end_offset=30):
    """Random date within offset range from today."""
    d = datetime.now() + timedelta(days=random.randint(start_offset, end_offset))
    return d


class DocPDF(FPDF):
    """Base PDF with common formatting."""

    def header_block(self, hospital, address, phone):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(20, 60, 120)
        self.cell(0, 10, hospital, new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT", align="C")
        self.cell(0, 5, phone, new_x="LMARGIN", new_y="NEXT", align="C")
        self.ln(2)
        self.set_draw_color(20, 60, 120)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(8)

    def label_value(self, label, value, bold_value=False):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(60, 60, 60)
        self.cell(50, 7, label + ":", new_x="END")
        self.set_font("Helvetica", "B" if bold_value else "", 10)
        self.set_text_color(20, 20, 20)
        self.cell(0, 7, str(value), new_x="LMARGIN", new_y="NEXT")

    def signature_block(self, doctor_name, credentials):
        self.ln(12)
        self.set_draw_color(0, 0, 0)
        self.line(15, self.get_y(), 80, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 20, 20)
        self.cell(0, 6, doctor_name, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(80, 80, 80)
        self.cell(0, 5, credentials, new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 5, f"License #: {random.randint(100000, 999999)}", new_x="LMARGIN", new_y="NEXT")

    def stamp(self, text="OFFICIAL"):
        self.set_font("Helvetica", "B", 24)
        self.set_text_color(200, 50, 50)
        x = random.randint(130, 160)
        y = self.get_y() - 20
        self.text(x, y, f"[{text}]")


def gen_medical_cert(idx, employee):
    """Generate a medical certificate for sick leave."""
    doc, cred = random.choice(DOCTORS)
    hosp = random.choice(HOSPITALS)
    diag, treatment = random.choice(DIAGNOSES_SICK)
    start = rand_date(-5, 10)
    days = random.choice([3, 4, 5, 7])
    end = start + timedelta(days=days - 1)

    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block(hosp, f"{random.randint(100,9999)} Medical Center Drive, San Francisco, CA", f"Tel: (415) {random.randint(200,999)}-{random.randint(1000,9999)}")

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 10, "MEDICAL CERTIFICATE", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(5)

    pdf.label_value("Date of Issue", start.strftime("%B %d, %Y"))
    pdf.label_value("Patient Name", employee, bold_value=True)
    pdf.label_value("Date of Birth", f"{random.choice(['Jan','Mar','Jun','Sep','Nov'])} {random.randint(1,28)}, {random.randint(1985,2000)}")
    pdf.ln(3)
    pdf.label_value("Diagnosis", diag, bold_value=True)
    pdf.label_value("Treatment", treatment)
    pdf.ln(3)
    pdf.label_value("Rest Period From", start.strftime("%Y-%m-%d"))
    pdf.label_value("Rest Period To", end.strftime("%Y-%m-%d"))
    pdf.label_value("Total Days", f"{days} days")
    pdf.ln(5)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(40, 40, 40)
    pdf.multi_cell(0, 6, f"This is to certify that {employee} has been examined and found to be suffering from {diag.lower()}. The patient is advised complete rest for the period mentioned above. {treatment}.")
    pdf.ln(3)
    pdf.multi_cell(0, 6, "This certificate is issued upon request of the patient for the purpose of sick leave application.")

    pdf.signature_block(doc, cred)
    pdf.stamp("VERIFIED")

    fname = f"medical_cert_{idx:02d}_{employee.replace(' ', '_').lower()}.pdf"
    pdf.output(os.path.join(OUT_DIR, fname))
    return fname


def gen_wh380(idx, employee):
    """Generate a WH-380 FMLA form."""
    doc, cred = random.choice(DOCTORS)
    hosp = random.choice(HOSPITALS)
    diag, treatment = random.choice(DIAGNOSES_FMLA)
    start = rand_date(-10, 20)
    weeks = random.choice([4, 6, 8, 12])

    pdf = DocPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 8, "U.S. Department of Labor", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, "Wage and Hour Division", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "CERTIFICATION OF HEALTH CARE PROVIDER", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "FOR EMPLOYEE'S SERIOUS HEALTH CONDITION", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, "(Family and Medical Leave Act)  - Form WH-380-E", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(5)
    pdf.set_draw_color(0, 0, 0)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    pdf.set_text_color(20, 20, 20)
    pdf.label_value("Section I  - Employee", employee)
    pdf.label_value("Employer", "ConvoWork Inc.")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Section II  - Health Care Provider", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.label_value("Provider Name", doc)
    pdf.label_value("Credentials", cred)
    pdf.label_value("Practice/Hospital", hosp)
    pdf.label_value("Phone", f"(415) {random.randint(200,999)}-{random.randint(1000,9999)}")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Section III  - Condition Details", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.label_value("Condition", diag, bold_value=True)
    pdf.label_value("Date Condition Began", start.strftime("%Y-%m-%d"))
    pdf.label_value("Probable Duration", f"{weeks} weeks")
    pdf.label_value("Treatment Plan", treatment)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, f"The patient requires medical leave due to a serious health condition ({diag.lower()}) that renders them unable to perform their job functions. {treatment}. The estimated recovery period is {weeks} weeks from the date indicated above.")
    pdf.ln(3)

    pdf.label_value("Patient Unable to Work", "Yes")
    pdf.label_value("Intermittent Leave Needed", random.choice(["Yes", "No"]))

    pdf.signature_block(doc, cred)
    pdf.stamp("WH-380")

    fname = f"wh380_fmla_{idx:02d}_{employee.replace(' ', '_').lower()}.pdf"
    pdf.output(os.path.join(OUT_DIR, fname))
    return fname


def gen_hospital_discharge(idx, employee):
    """Generate hospital discharge papers for maternity."""
    hosp = random.choice(HOSPITALS)
    baby = random.choice(BABY_NAMES)
    birth_date = rand_date(-5, 5)
    discharge = birth_date + timedelta(days=random.choice([2, 3]))

    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block(hosp, f"{random.randint(100,9999)} Hospital Blvd, San Francisco, CA", f"Tel: (415) {random.randint(200,999)}-{random.randint(1000,9999)}")

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 10, "HOSPITAL DISCHARGE SUMMARY", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(5)

    pdf.label_value("Patient Name", employee, bold_value=True)
    pdf.label_value("Date of Admission", birth_date.strftime("%Y-%m-%d"))
    pdf.label_value("Date of Discharge", discharge.strftime("%Y-%m-%d"))
    pdf.label_value("Attending Physician", random.choice(DOCTORS)[0])
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Delivery Details", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.label_value("Type of Delivery", random.choice(["Normal Vaginal Delivery", "Cesarean Section"]))
    pdf.label_value("Date of Birth", birth_date.strftime("%B %d, %Y"))
    pdf.label_value("Infant Name", f"Baby {baby} {employee.split()[-1]}")
    pdf.label_value("Infant Weight", f"{random.randint(5,9)} lbs {random.randint(0,15)} oz")
    pdf.label_value("Infant Status", "Healthy  - discharged with mother")
    pdf.ln(3)

    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, f"Patient {employee} was admitted for childbirth and delivered a healthy infant. Both mother and baby are in stable condition. Patient is cleared for discharge and advised to follow up with OB/GYN within 6 weeks.")
    pdf.ln(3)
    pdf.label_value("Recommended Maternity Leave", f"{random.choice([8,10,12])} weeks")

    pdf.signature_block(random.choice(DOCTORS)[0], "MD, Obstetrics & Gynecology")
    pdf.stamp("DISCHARGED")

    fname = f"discharge_maternity_{idx:02d}_{employee.replace(' ', '_').lower()}.pdf"
    pdf.output(os.path.join(OUT_DIR, fname))
    return fname


def gen_birth_cert(idx, employee):
    """Generate a birth certificate for paternity leave."""
    baby = random.choice(BABY_NAMES)
    birth_date = rand_date(-10, 5)

    pdf = DocPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(20, 60, 120)
    pdf.cell(0, 10, "STATE OF CALIFORNIA", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "DEPARTMENT OF PUBLIC HEALTH", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 10, "CERTIFICATE OF LIVE BIRTH", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(2)
    pdf.set_draw_color(20, 60, 120)
    pdf.set_line_width(1)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)

    pdf.label_value("Child's Name", f"{baby} {employee.split()[-1]}", bold_value=True)
    pdf.label_value("Date of Birth", birth_date.strftime("%B %d, %Y"))
    pdf.label_value("Time of Birth", f"{random.randint(1,12)}:{random.randint(10,59)} {'AM' if random.random() > 0.5 else 'PM'}")
    pdf.label_value("Place of Birth", f"{random.choice(HOSPITALS)}, San Francisco, CA")
    pdf.label_value("Sex", random.choice(["Male", "Female"]))
    pdf.ln(3)
    pdf.label_value("Father's Name", employee if random.random() > 0.3 else f"{employee.split()[0]} {employee.split()[-1]}")
    pdf.label_value("Mother's Name", f"{random.choice(['Jennifer','Michelle','Stephanie','Christina','Amanda'])} {employee.split()[-1]}")
    pdf.ln(3)
    pdf.label_value("Certificate Number", f"CA-{random.randint(100000,999999)}-{random.randint(2025,2026)}")
    pdf.label_value("Date Filed", (birth_date + timedelta(days=random.randint(3, 10))).strftime("%Y-%m-%d"))

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, "This is a certified copy issued by the State Registrar of Vital Statistics.", new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.stamp("CERTIFIED")

    fname = f"birth_cert_{idx:02d}_{employee.replace(' ', '_').lower()}.pdf"
    pdf.output(os.path.join(OUT_DIR, fname))
    return fname


def gen_death_cert(idx, employee):
    """Generate a death certificate for bereavement leave."""
    deceased = random.choice(DECEASED_NAMES)
    relation = random.choice(DECEASED_RELATIONS)
    death_date = rand_date(-15, -1)

    pdf = DocPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(20, 60, 120)
    pdf.cell(0, 10, "STATE OF CALIFORNIA", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "DEPARTMENT OF PUBLIC HEALTH", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 10, "CERTIFICATE OF DEATH", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(2)
    pdf.set_draw_color(80, 80, 80)
    pdf.set_line_width(1)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)

    pdf.label_value("Deceased Name", deceased, bold_value=True)
    pdf.label_value("Date of Death", death_date.strftime("%B %d, %Y"))
    pdf.label_value("Place of Death", f"{random.choice(HOSPITALS)}, San Francisco, CA")
    pdf.label_value("Age at Death", f"{random.randint(55, 88)} years")
    pdf.label_value("Cause of Death", random.choice(["Natural Causes", "Cardiac Arrest", "Respiratory Failure", "Cancer  - Terminal Illness"]))
    pdf.ln(3)
    pdf.label_value("Attending Physician", random.choice(DOCTORS)[0])
    pdf.label_value("Funeral Home", f"{random.choice(['Grace','Eternal Rest','Peaceful Valley','Oak Hill'])} Funeral Services")
    pdf.ln(3)
    pdf.label_value("Certificate Number", f"CA-D-{random.randint(100000,999999)}")
    pdf.label_value("Date Filed", (death_date + timedelta(days=random.randint(2, 7))).strftime("%Y-%m-%d"))
    pdf.ln(3)
    pdf.label_value("Relation to Employee", f"{relation} of {employee}")

    pdf.stamp("OFFICIAL")

    fname = f"death_cert_{idx:02d}_{employee.replace(' ', '_').lower()}.pdf"
    pdf.output(os.path.join(OUT_DIR, fname))
    return fname


# ── Generate all documents ────────────────────────────────────────────────────
if __name__ == "__main__":
    generated = []

    # 15 medical certificates (sick leave)
    for i in range(15):
        emp = random.choice(EMPLOYEES)
        f = gen_medical_cert(i + 1, emp)
        generated.append(("medical_certificate", f, emp))
        print(f"  Created: {f}")

    # 10 WH-380 forms (FMLA)
    for i in range(10):
        emp = random.choice(EMPLOYEES)
        f = gen_wh380(i + 1, emp)
        generated.append(("wh380_form", f, emp))
        print(f"  Created: {f}")

    # 5 hospital discharge (maternity)
    for i in range(5):
        emp = random.choice([e for e in EMPLOYEES if e.split()[0] in ["Emily", "Aisha", "Olivia", "Sophia", "Hannah", "Priya", "Sarah", "Roma"]])
        f = gen_hospital_discharge(i + 1, emp)
        generated.append(("hospital_discharge", f, emp))
        print(f"  Created: {f}")

    # 5 birth certificates (paternity)
    for i in range(5):
        emp = random.choice([e for e in EMPLOYEES if e.split()[0] in ["James", "Marcus", "John", "Carlos", "David", "Alex", "Ryan"]])
        f = gen_birth_cert(i + 1, emp)
        generated.append(("birth_certificate", f, emp))
        print(f"  Created: {f}")

    # 5 death certificates (bereavement)
    for i in range(5):
        emp = random.choice(EMPLOYEES)
        f = gen_death_cert(i + 1, emp)
        generated.append(("death_certificate", f, emp))
        print(f"  Created: {f}")

    print(f"\n{'='*60}")
    print(f"Generated {len(generated)} documents in {OUT_DIR}")
    print(f"{'='*60}")

    # Write manifest
    with open(os.path.join(OUT_DIR, "manifest.txt"), "w") as mf:
        for doc_type, fname, emp in generated:
            mf.write(f"{doc_type}|{fname}|{emp}\n")
    print(f"Manifest written to {OUT_DIR}/manifest.txt")
