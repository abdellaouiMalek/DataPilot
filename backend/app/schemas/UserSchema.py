from pydantic import BaseModel, EmailStr

# Données requises pour l'inscription
class UserCreate(BaseModel):
    email: EmailStr
    password: str

# Données renvoyées par l'API après création
class UserResponse(BaseModel):
    id: int
    email: EmailStr

    class Config:
        from_attributes = True