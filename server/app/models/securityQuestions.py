from uuid import UUID
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from typing import Optional, List
from pydantic import BaseModel, Field as PydanticField



class UserSecurityQuestion(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_security_question"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    question: str
    answer_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_burned: bool = Field(default=False)

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
