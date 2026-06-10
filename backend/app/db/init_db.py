import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from app.db.database import Base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL est manquant dans le fichier .env")

SYNC_URL = DATABASE_URL.replace("+asyncpg", "+psycopg2")

def test_and_run():
    print("Vérification de la connexion à PostgreSQL...")
    engine = create_engine(SYNC_URL)
    try:
        # Tentative de connexion pour intercepter l'erreur Windows
        with engine.connect():
            pass
    except Exception as e:
        print("\n❌ ERREUR DE CONNEXION POSTGRESQL :")
        try:
            # On force le décodage du message d'erreur Windows en CP1252 (Français)
            error_msg = str(e).encode('utf-8', errors='ignore').decode('cp1252', errors='ignore')
            print(error_msg)
        except:
            print(e)
        print("\nVérifie : 1. Si la base 'datapilot' existe. 2. Si le DATABASE_URL du .env est correct.")
        return

    print("Connexion réussie ! Création des tables...")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("🚀 Tables créées avec succès !")

if __name__ == "__main__":
    test_and_run()