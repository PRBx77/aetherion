"""
Detección auto EN/ES con reglas para textos cortos.
"""
from langdetect import detect, DetectorFactory, LangDetectException
import re

DetectorFactory.seed = 0
DEFAULT_LANG = "en"

# Palabras/saludos comunes ES que langdetect confunde en textos cortos
ES_SHORT_KEYWORDS = {
    # Saludos
    "hola", "buenos", "buenas", "días", "tardes", "noches", "adiós",
    "gracias", "favor",
    # Interrogativas (con y sin tilde)
    "qué", "que", "cómo", "como", "dónde", "donde", "cuándo", "cuando",
    "cuánto", "cuanto", "quién", "quien", "cuál", "cual", "por qué", "porque",
    # Verbos comunes
    "eres", "soy", "estás", "está", "es", "son", "somos", "hay", "tener",
    "hacer", "querer", "necesitar", "poder", "puedo", "puedes", "tengo",
    "tienes", "quiero", "quieres", "sabes", "sé", "dime", "cuéntame",
    "explícame", "dame", "muestrame",
    # Sustantivos frecuentes
    "amigo", "amiga", "hora", "tiempo", "día", "año", "mes",
    "precio", "dinero", "moneda", "criptomoneda", "mercado",
    # Adjetivos/adverbios
    "sí", "no", "también", "tambien", "ahora", "hoy", "ayer", "mañana",
    "bien", "mal", "muy", "más", "menos",
    # Meta
    "hablas", "español", "castellano", "ayuda", "socorro"
}

# Palabras EN típicas
EN_SHORT_KEYWORDS = {
    "hi", "hello", "hey", "please", "thanks", "thank you",
    "what", "how", "where", "when", "who", "which", "are you",
    "i am", "yes", "no", "can you", "help", "english", "want", "need"
}


def detect_language(text: str) -> str:
    text = text.strip().lower()

    if len(text) < 2:
        return DEFAULT_LANG

    # Regla 1: caracteres exclusivos español (ñ, tildes, ¿, ¡)
    if re.search(r"[ñáéíóú¿¡]", text):
        return "es"

    # Regla extra: 2+ palabras del diccionario ES = ES seguro
    words_lower = text.split()
    if len(words_lower) >= 2:
        first_word = words_lower[0]
        if first_word in ES_SHORT_KEYWORDS:
            return "es"

    # Regla 2: palabras ES cortas frecuentes
    words = set(re.findall(r"\w+", text))
    es_hits = len(words & ES_SHORT_KEYWORDS)
    en_hits = len(words & EN_SHORT_KEYWORDS)

    if es_hits > en_hits:
        return "es"
    if en_hits > es_hits:
        return "en"

    # Regla 3: si sigue empatado y es corto, langdetect
    if len(text) < 15 and es_hits == 0 and en_hits == 0:
        return DEFAULT_LANG

    # Regla 4: langdetect para textos largos
    try:
        lang = detect(text)
        if lang == "es":
            return "es"
        if lang == "en":
            return "en"
        # Otros idiomas latinos → default EN
        return DEFAULT_LANG
    except LangDetectException:
        return DEFAULT_LANG


if __name__ == "__main__":
    tests = [
        ("hola", "es"),
        ("hi", "en"),
        ("hola amigo", "es"),
        ("hello there", "en"),
        ("¿qué eres?", "es"),
        ("what are you?", "en"),
        ("gracias", "es"),
        ("thanks", "en"),
        ("Cuéntame sobre Venus", "es"),
        ("Tell me about Venus", "en"),
        ("hola puedo ser tu amigo", "es"),
    ]
    correct = 0
    for text, expected in tests:
        got = detect_language(text)
        mark = "✅" if got == expected else "❌"
        if got == expected: correct += 1
        print(f"  {mark} [{got}] (expected {expected}) → '{text}'")
    print(f"\n  Score: {correct}/{len(tests)}")
