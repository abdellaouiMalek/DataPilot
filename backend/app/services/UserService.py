from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.User import User
from app.schemas.UserSchema import UserCreate

class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_user(self, user_data: UserCreate) -> User:
        # 1. Vérifier si l'utilisateur existe déjà
        query = select(User).where(User.email == user_data.email)
        result = await self.db.execute(query)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Cet email est déjà enregistré."
            )

        # 2. Créer le nouvel utilisateur (mot de passe en brut pour l'instant)
        new_user = User(
            email=user_data.email,
            password_hash=user_data.password
        )
        
        # 3. Sauvegarder en base de données
        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        
        return new_user