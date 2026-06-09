from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.schemas.UserSchema import UserCreate, UserResponse
from app.services.UserService import UserService

router = APIRouter(prefix="/users", tags=["Users"])

# Fonction d'aide pour injecter le service facilement
def get_user_service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(db)

@router.post("/add_user", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate, 
    user_service: UserService = Depends(get_user_service)
):
    # Appel direct de la méthode du service
    return await user_service.register_user(user_data)