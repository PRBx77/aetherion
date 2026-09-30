"""
Motor LLM para Aetherion.
Usa Ollama Llama 3.1 8B local.
"""
import ollama
from typing import AsyncGenerator

MODEL = "llama3.1:8b"
TEMPERATURE = 0.8  # Un poco creativo pero controlado
MAX_TOKENS = 300


async def generate_response(
    system_prompt: str,
    user_message: str,
    stream: bool = False
) -> str:
    """
    Genera respuesta síncrona (para API REST).
    """
    response = ollama.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        options={
            "temperature": TEMPERATURE,
            "num_predict": MAX_TOKENS,
            "top_p": 0.9,
            "repeat_penalty": 1.15
        }
    )
    return response["message"]["content"].strip()


def check_model_ready() -> bool:
    """Verifica que el modelo está disponible."""
    try:
        models = ollama.list()
        model_names = [m["model"] if isinstance(m, dict) and "model" in m else str(m) for m in models.get("models", [])]
        return any(MODEL in name for name in model_names)
    except Exception as e:
        print(f"Error checking model: {e}")
        return False


if __name__ == "__main__":
    print(f"Model {MODEL} ready:", check_model_ready())
    import asyncio
    from prompts import get_system_prompt
    resp = asyncio.run(generate_response(
        get_system_prompt("en"),
        "What are you?"
    ))
    print("\nAETHERION:", resp)
