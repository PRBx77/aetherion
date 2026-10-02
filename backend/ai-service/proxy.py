"""Proxy que une frontend (8200) + API (8100) en puerto 8300."""
from flask import Flask, request, Response, send_from_directory
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)

FRONTEND_DIR = "/mnt/data/CROTALUS_INVEST/aetherion/frontend"
API_URL = "http://localhost:8100"


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "DELETE"])
def api_proxy(path):
    r = requests.request(
        method=request.method,
        url=f"{API_URL}/{path}",
        headers={k: v for k, v in request.headers if k.lower() != "host"},
        data=request.get_data(),
        params=request.args,
        allow_redirects=False
    )
    return Response(r.content, status=r.status_code, headers=dict(r.headers))


@app.route("/", defaults={"path": "aetherion-preview.html"})
@app.route("/<path:path>")
def frontend(path):
    full_path = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "aetherion-preview.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8300, debug=False)
