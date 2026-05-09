from uuid import UUID
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from pydantic import BaseModel, Field as PydanticField



class UserSecurityQuestion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    question: str
    answer_hash: str

    user: "User" = Relationship(back_populates="security_questions")



class SecurityQuestionItem(BaseModel):
    question: str = PydanticField(..., json_schema_extra={"example": "What is your mother's maiden name?"})
    answer: str = PydanticField(..., json_schema_extra={"example":"Smith"})

class AddSecurityQuestion(BaseModel):
    questions: list[SecurityQuestionItem]

from pydantic import BaseModel, Field as PydanticField

class SecurityQuestionOut(BaseModel):
    question: str

class SecurityAnswerIn(BaseModel):
    question: str
    answer: str

class SecurityAnswerOut(BaseModel):
    correct: bool
