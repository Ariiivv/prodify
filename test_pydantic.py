from pydantic import BaseModel, Field; from typing import Optional;
class M(BaseModel):
    v: Optional[float] = Field(default=None, ge=0)
print(M(v=None))
