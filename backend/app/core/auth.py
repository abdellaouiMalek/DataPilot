from jose import jwt
import requests
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer

import os
from dotenv import load_dotenv

load_dotenv()

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL")
REALM = os.getenv("KEYCLOAK_REALM")
ALGORITHMS = [os.getenv("KEYCLOAK_ALGORITHMS")]

security = HTTPBearer()

def get_public_key():
    certs = requests.get(
        f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/certs"
    ).json()

    return certs["keys"][0]

def verify_token(credentials=Depends(security)):
    token = credentials.credentials

    try:
        unverified_header = jwt.get_unverified_header(token)

        certs = requests.get(
            f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/certs"
        ).json()

        key = certs["keys"][0]

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

        payload = jwt.decode(
            token,
            public_key,
            algorithms=ALGORITHMS,
            audience="react-app"
        )

        return payload

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")