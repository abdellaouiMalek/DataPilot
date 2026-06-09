import psycopg2
from sqlalchemy import create_engine
from app.db.database import Base

SYNC_URL = "postgresql+psycopg2://postgres:root@127.0.0.1:5432/datapilot"

def test_and_run():
    print("Vérification de la connexion à PostgreSQL...")
    try:
        # Tentative de connexion brute pour intercepter l'erreur Windows
        conn = psycopg2.connect("host=127.0.0.1 user=postgres password=root dbname=datapilot")
        conn.close()
    except Exception as e:
        print("\n❌ ERREUR DE CONNEXION POSTGRESQL :")
        try:
            # On force le décodage du message d'erreur Windows en CP1252 (Français)
            error_msg = str(e).encode('utf-8', errors='ignore').decode('cp1252', errors='ignore')
            print(error_msg)
        except:
            print(e)
        print("\nVérifie : 1. Si la base 'datapilot' existe. 2. Si le mot de passe est bien 'root'.")
        return

    print("Connexion réussie ! Création des tables...")
    engine = create_engine(SYNC_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("🚀 Tables créées avec succès !")

if __name__ == "__main__":
    test_and_run()