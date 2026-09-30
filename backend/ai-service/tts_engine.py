"""
Text-to-Speech con Piper para Aetherion.
Voz Ryan (EN) + carlfm (ES).
"""
import subprocess
import tempfile
import os
from pathlib import Path

MODELS_DIR = Path("/mnt/data/dwall_video/tts_models")
VOICE_EN = MODELS_DIR / "en_US-ryan-high.onnx"
VOICE_ES = MODELS_DIR / "es_ES-carlfm-x_low.onnx"

PIPER_BIN = os.path.expanduser("~/.local/bin/piper")

AUDIO_CACHE = Path("/tmp/aetherion_audio")
AUDIO_CACHE.mkdir(exist_ok=True)


def synthesize(text: str, lang: str = "en") -> bytes:
    """
    Genera audio WAV desde texto.
    Devuelve bytes del WAV listo para reproducir.
    """
    voice = VOICE_EN if lang == "en" else VOICE_ES

    if not voice.exists():
        raise FileNotFoundError(f"Voice model not found: {voice}")

    # Slower for oracular feel
    length_scale = "1.15" if lang == "en" else "1.10"

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=AUDIO_CACHE) as f:
        output_path = f.name

    try:
        proc = subprocess.run(
            [PIPER_BIN,
             "--model", str(voice),
             "--output_file", output_path,
             "--length-scale", length_scale],
            input=text,
            capture_output=True,
            text=True,
            timeout=60
        )

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 100:
            raise RuntimeError(f"Piper failed: {proc.stderr[:200]}")

        with open(output_path, "rb") as fw:
            data = fw.read()

        return data
    finally:
        # Cleanup temp file
        try:
            os.unlink(output_path)
        except:
            pass


def check_voices() -> dict:
    return {
        "en_ready": VOICE_EN.exists(),
        "es_ready": VOICE_ES.exists(),
        "piper_ready": os.path.exists(PIPER_BIN)
    }


if __name__ == "__main__":
    print("Voices:", check_voices())
    print("Generating test EN...")
    audio_en = synthesize("I am Aetherion. The primordial soul awakens.", "en")
    print(f"  ✅ Generated {len(audio_en)} bytes WAV")

    print("Generating test ES...")
    audio_es = synthesize("Soy Aetherion. El alma primordial despierta.", "es")
    print(f"  ✅ Generated {len(audio_es)} bytes WAV")
