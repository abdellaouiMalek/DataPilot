import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL")

def setup_cors(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Content-Disposition isn't on the CORS "safe" response-header
        # allowlist, so without this a cross-origin `fetch` can see the PDF/
        # CSV download's bytes but not the filename the backend suggested for
        # it -- silently, no error, `res.headers.get(...)` just returns null.
        expose_headers=["Content-Disposition"],
    )