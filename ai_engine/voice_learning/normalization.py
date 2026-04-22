from __future__ import annotations

import re

RU_ABBREVIATIONS = {
    "ул": "улица",
    "ул.": "улица",
    "д": "дом",
    "д.": "дом",
    "к": "корпус",
    "к.": "корпус",
    "корп": "корпус",
    "корп.": "корпус",
    "стр": "строение",
    "стр.": "строение",
}

RU_NUMBER_WORDS = {
    "ноль": "0",
    "один": "1",
    "первый": "1",
    "одна": "1",
    "два": "2",
    "две": "2",
    "второй": "2",
    "три": "3",
    "третий": "3",
    "четыре": "4",
    "четвертый": "4",
    "четвёртый": "4",
    "пять": "5",
    "шесть": "6",
    "семь": "7",
    "восемь": "8",
    "девять": "9",
    "десять": "10",
}


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_basic_text(text: str) -> str:
    text = text.replace("ё", "е")
    text = re.sub(r"[,;]+", " ", text)
    text = re.sub(r"[()\[\]{}]", " ", text)
    return normalize_whitespace(text.lower())


def normalize_russian_address_text(text: str) -> str:
    normalized = normalize_basic_text(text)
    tokens = normalized.split(" ")
    expanded: list[str] = []

    for token in tokens:
        expanded.append(RU_ABBREVIATIONS.get(token, RU_NUMBER_WORDS.get(token, token)))

    normalized = " ".join(expanded)
    normalized = re.sub(r"\bдом\s+", "", normalized)
    normalized = re.sub(r"\bулица\s+", "", normalized)
    normalized = normalize_whitespace(normalized)
    return normalized


def build_ru_text_variants(text: str) -> list[str]:
    normalized = normalize_russian_address_text(text)
    variants = {
        normalized,
        normalized.replace(" корпус ", " к "),
        normalized.replace(" корпус ", " корп "),
    }

    if "чароитовая" in normalized:
        variants.add(normalized.replace("чароитовая", "хароитовая"))
        variants.add(normalized.replace("чароитовая", "шароитовая"))
        variants.add(normalized.replace("чароитовая", "чароит овая"))

    match = re.search(r"(?P<street>[а-яa-z\-\s]+) (?P<house>\d+[а-яa-z]?) корпус (?P<corpus>\d+[а-яa-z]?)", normalized)
    if match:
        street = normalize_whitespace(match.group("street"))
        house = match.group("house")
        corpus = match.group("corpus")
        variants.add(f"{street} улица дом {house} корпус {corpus}")
        variants.add(f"{house} корпус {corpus} {street}")
        variants.add(f"{street} {house}-{corpus}")

    return sorted(v for v in variants if v)