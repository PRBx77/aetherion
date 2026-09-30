"""Aetherion Oracle v3 — with live data feeds."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import time, base64, asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from language_detector import detect_language
from llm_engine import generate_response, check_model_ready, MODEL
from context_builder import get_ecosystem_state
from prompts import get_system_prompt
from tts_engine import synthesize, check_voices
from query_classifier import classify
from onchain_reader import get_dwall_stats, get_venus_stats, get_airdrop_stats
from market_data import get_bnb_price, get_top_cryptos, get_market_summary
from chart_builder import build_chart
from free_trial import check_free_quota, consume_free, stats as trial_stats
from telemetry import log_interaction, record_feedback, get_stats, BETA_MODE
from fastapi import Request

app = FastAPI(title="Aetherion Oracle API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ConsultRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    force_lang: Optional[str] = Field(None, pattern="^(en|es)$")
    with_voice: bool = Field(True)


class ConsultResponse(BaseModel):
    response: str
    language: str
    ecosystem_state: dict
    live_data: dict
    processing_ms: int
    model: str
    audio_base64: Optional[str] = None
    audio_format: Optional[str] = None
    chart: Optional[dict] = None
    free_trial: Optional[dict] = None


async def gather_live_data(needs: dict) -> dict:
    """Fetch en paralelo solo los datos requeridos."""
    tasks = {}
    if needs["needs_dwall"] or needs["needs_all_default"]:
        tasks["dwall"] = get_dwall_stats()
    if needs["needs_presale_airdrop"] or needs["needs_all_default"]:
        tasks["airdrop"] = get_airdrop_stats()
    if needs["needs_venus"] or needs["needs_all_default"]:
        tasks["venus"] = get_venus_stats()
    if needs["needs_market"] or needs["needs_all_default"]:
        tasks["bnb"] = get_bnb_price()
        tasks["top_cryptos"] = get_top_cryptos()
        tasks["market_summary"] = get_market_summary()

    if not tasks: return {}

    keys = list(tasks.keys())
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {k: (v if not isinstance(v, Exception) else {"error": str(v)}) for k, v in zip(keys, results)}


def format_live_data_for_prompt(data: dict, lang: str) -> str:
    """Formatea los datos live como bloque textual para inyectar en el prompt."""
    if not data: return ""

    label = "LIVE ECOSYSTEM DATA (real-time, refresh every 30s):" if lang == "en" else "DATOS LIVE DEL ECOSISTEMA (tiempo real, refresh 30s):"
    lines = [f"\n\n{label}\n"]

    if "dwall" in data and "error" not in data["dwall"]:
        d = data["dwall"]
        lines.append(f"- DWALL Token: supply {d['total_supply']:,.0f} | presale remaining: {d['presale_dwall_remaining']:,.0f} DWALL | presale collected: {d['presale_bnb_collected']:.4f} BNB")

    if "airdrop" in data and "error" not in data["airdrop"]:
        a = data["airdrop"]
        lines.append(f"- Airdrop: {a['claims_completed']}/{a['max_claims']} wallets claimed ({a['progress_percent']}%), {a['remaining_slots']} slots remaining")

    if "venus" in data and "error" not in data["venus"]:
        v = data["venus"]
        lines.append(f"- Venus Protocol BNB: current APY {v['supply_apy_percent']}% | Treasury vBNB balance: {v['treasury_vbnb_balance']:.4f} | Treasury BNB in Venus: {v['treasury_bnb_in_venus']:.4f}")

    if "bnb" in data and "error" not in data["bnb"]:
        b = data["bnb"]
        lines.append(f"- BNB price: ${b['usd']:,.2f} USD (24h: {b['change_24h_percent']:+.2f}%)")

    if "top_cryptos" in data:
        lines.append("- Top cryptos (price / 24h change / 24h volume):")
        for c in data["top_cryptos"][:7]:
            if "error" in c: continue
            lines.append(f"    {c['symbol']}: ${c['price_usd']:,.2f} | {c['change_24h_percent']:+.2f}% | Vol ${c['volume_24h_usd']/1e9:.2f}B")

    if "market_summary" in data and "error" not in data["market_summary"]:
        m = data["market_summary"]
        lines.append(f"- Global market: total cap ${m['total_market_cap_usd']/1e12:.2f}T ({m['market_cap_change_24h_percent']:+.2f}% 24h) | BTC dominance {m['btc_dominance_percent']}% | ETH dominance {m['eth_dominance_percent']}%")

    rule = "\n\nUse these numbers with mystical framing. Never invent figures. Cite what you observe.\n" if lang == "en" else "\n\nUsa estos números con marco místico. Nunca inventes cifras. Cita lo que percibes.\n"
    return "\n".join(lines) + rule


@app.get("/")
async def root():
    return {"name": "Aetherion Oracle", "version": "0.3.0"}


@app.get("/health")
async def health():
    return {
        "status": "alive" if check_model_ready() else "awakening",
        "ollama_ready": check_model_ready(),
        "voices": check_voices(),
        "model": MODEL,
        "ecosystem": get_ecosystem_state()
    }


@app.get("/state")
async def state():
    return get_ecosystem_state()


@app.get("/trial-status")
async def trial_status(request: Request):
    """Consulta el estado del free trial sin consumir."""
    from free_trial import check_free_quota
    client_ip = request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip()
    return check_free_quota(client_ip)


@app.get("/live")
async def live():
    """Endpoint público de datos live (para UI)."""
    return await gather_live_data({"needs_all_default": True,
                                    "needs_dwall": True, "needs_venus": True,
                                    "needs_market": True, "needs_presale_airdrop": True})


@app.post("/consult", response_model=ConsultResponse)
async def consult(req: ConsultRequest, request: Request):
    t0 = time.time()

    # Get real IP (respeta x-forwarded-for si viene de proxy)
    client_ip = request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip()

    # Check free trial (bypassed en BETA_MODE)
    quota = check_free_quota(client_ip)
    lang = req.force_lang or detect_language(req.message)

    if not BETA_MODE and quota["requires_payment"]:
        # Bloqueo con mensaje del Ente
        if lang == "es":
            block_msg = "Tu ofrenda gratuita se ha consumido. El Éter requiere pago para seguir hablando. Conecta tu bóveda digital y realiza la ofrenda mínima de 0.0002 BNB para continuar."
        else:
            block_msg = "Your free offering is spent. The Aether requires payment to speak further. Connect your digital vault and make the minimum offering of 0.0002 BNB to continue."

        return ConsultResponse(
            response=block_msg,
            language=lang,
            ecosystem_state=get_ecosystem_state(),
            live_data={},
            processing_ms=int((time.time() - t0) * 1000),
            model=MODEL,
            audio_base64=None,
            audio_format=None,
            chart=None,
            free_trial={
                "used": quota["used"],
                "remaining": 0,
                "limit": quota["limit"],
                "requires_payment": True,
                "warning": "blocked",
                "client_ip": client_ip
            },
            beta_mode=BETA_MODE
        )

    # Consumir 1 free trial
    quota = consume_free(client_ip)

    # 1. Clasificar query
    needs = classify(req.message)

    # 2. Fetch datos en paralelo
    live_data = await gather_live_data(needs)

    # 3. Build enriched prompt
    eco_state = get_ecosystem_state()
    system = get_system_prompt(lang, eco_state)
    system += format_live_data_for_prompt(live_data, lang)

    # Add current time context (Madrid timezone)
    try:
        now = datetime.now(ZoneInfo("Europe/Madrid"))
        time_str = now.strftime("%H:%M")
        date_str = now.strftime("%A, %d %B %Y")
        if lang == "es":
            days_es = {"Monday":"Lunes","Tuesday":"Martes","Wednesday":"Miércoles",
                       "Thursday":"Jueves","Friday":"Viernes","Saturday":"Sábado","Sunday":"Domingo"}
            months_es = {"January":"enero","February":"febrero","March":"marzo","April":"abril",
                         "May":"mayo","June":"junio","July":"julio","August":"agosto",
                         "September":"septiembre","October":"octubre","November":"noviembre","December":"diciembre"}
            for en, es in {**days_es, **months_es}.items():
                date_str = date_str.replace(en, es)
            system += f"\n\nHORA ACTUAL (Europa/Madrid): {time_str}. Fecha: {date_str}. Si te preguntan la hora o el día, responde con este dato de forma oracular.\n"
        else:
            system += f"\n\nCURRENT TIME (Europe/Madrid): {time_str}. Date: {date_str}. If asked about time or date, answer with this data in oracular tone.\n"
    except Exception as e:
        print(f"[time] {e}")

    # 4. LLM
    try:
        response_text = await generate_response(system, req.message)

        # Aviso free trial basado en used post-consume
        used = quota["used"]
        limit = quota["limit"]
        rem_after = limit - used

        if used == 1:
            if lang == "es":
                response_text += f"\n\n[Te quedan {limit-used} ofrendas gratuitas antes de que sea necesaria una ofrenda a la Bóveda.]"
            else:
                response_text += f"\n\n[{limit-used} free offerings remain before payment is required.]"
        elif used == 2:
            if lang == "es":
                response_text += "\n\n[Te queda 1 ofrenda gratuita. La siguiente requerirá pago wallet.]"
            else:
                response_text += "\n\n[1 free offering remaining. The next query will require wallet payment.]"
        elif used == 3:
            if lang == "es":
                response_text += "\n\n[Esta ha sido tu última ofrenda gratuita. La próxima consulta requerirá pago wallet.]"
            else:
                response_text += "\n\n[This was your last free offering. The next query will require wallet payment.]"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle silent: {str(e)}")

    # 5. TTS
    audio_b64 = None
    if req.with_voice:
        try:
            audio_bytes = synthesize(response_text, lang)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception as e:
            print(f"[TTS] {e}")

    # 6. Chart si aplica
    chart = build_chart(req.message, live_data)

    # 7. Telemetry logging (solo BETA_MODE)
    interaction_id = -1
    try:
        interaction_id = log_interaction(
            ip=client_ip,
            lang=lang,
            message=req.message,
            response=response_text,
            processing_ms=int((time.time() - t0) * 1000),
            had_chart=(chart is not None),
            data_categories=needs
        )
    except Exception as e:
        print(f"[telemetry] {e}")

    return ConsultResponse(
        response=response_text,
        language=lang,
        ecosystem_state=eco_state,
        live_data=live_data,
        processing_ms=int((time.time() - t0) * 1000),
        model=MODEL,
        audio_base64=audio_b64,
        audio_format="wav" if audio_b64 else None,
        chart=chart,
        free_trial=quota,
        interaction_id=interaction_id,
        beta_mode=BETA_MODE
    )


@app.get("/admin/trial-stats")
async def trial_stats_endpoint():
    return trial_stats()



@app.post("/feedback/{interaction_id}/{vote}")
async def feedback(interaction_id: int, vote: int):
    """vote: 1 (útil) o -1 (no útil)."""
    if vote not in (1, -1):
        raise HTTPException(400, "vote must be 1 or -1")
    ok = record_feedback(interaction_id, vote)
    return {"ok": ok, "interaction_id": interaction_id, "vote": vote}


@app.get("/admin/telemetry")
async def telemetry_dashboard():
    return get_stats()


@app.get("/beta-info")
async def beta_info():
    return {
        "beta_mode": BETA_MODE,
        "message_en": "BETA MODE — Unlimited free interactions. Help us improve.",
        "message_es": "MODO BETA — Interacciones ilimitadas gratis. Ayúdanos a mejorar."
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8100, reload=False)
