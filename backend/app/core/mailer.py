"""Minimal SMTP mailer for transactional emails sent by the backend itself
(credentials emails that Keycloak cannot send, since its templates only carry
action links, never passwords). Uses the blocking stdlib client in a thread so
the event loop is never blocked.
"""

from __future__ import annotations

import asyncio
import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv
from fastapi import HTTPException, status

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "DataPilot")


def _send_sync(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    if not (SMTP_USER and SMTP_PASSWORD):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SMTP non configuré (SMTP_USER / SMTP_PASSWORD manquants dans backend/.env).",
        )
    try:
        await asyncio.to_thread(_send_sync, to, subject, body)
    except smtplib.SMTPException:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="L'envoi de l'email a échoué (serveur SMTP).",
        )
    except OSError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serveur SMTP injoignable.",
        )
