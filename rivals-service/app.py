import os
import secrets
from fastapi import FastAPI, Header, HTTPException, Query
from rivals_api import RivalsClient
from threading import BoundedSemaphore

app = FastAPI()
slots = BoundedSemaphore(3)

def raw(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(k): raw(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [raw(v) for v in value]
    return raw(value.raw) if hasattr(value, "raw") else value

@app.get("/health")
def health():
    return {"ok": True, "configured": bool(os.getenv("RIVALS_SERVICE_TOKEN"))}

@app.get("/stats/{kind}")
def stats(kind: str, player: str = Query("", max_length=100), authorization: str = Header("")):
    token = os.getenv("RIVALS_SERVICE_TOKEN")
    if not token or not secrets.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(401, "Unauthorized")
    if kind not in {"profile", "livegame", "proficiency", "matchhistory", "top500"}:
        raise HTTPException(404, "Unknown category")
    if kind != "top500" and not player.strip():
        raise HTTPException(400, "Player required")
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Service busy")
    try:
        with RivalsClient() as client:
            if kind == "top500":
                return {"data": raw(client.leaderboards.fetch(limit=100))}
            p = client.get_player(player.strip())
            if kind == "profile":
                result = p
            elif kind == "livegame":
                result = p.live_game.fetch()
            elif kind == "proficiency":
                result = p.proficiency.fetch()
            else:
                result = p.matches.fetch(limit=10)
            return {"data": raw(result), "uid": str(p.uid), "name": p.name}
    except Exception:
        raise HTTPException(502, "Provider request failed")
    finally:
        slots.release()
