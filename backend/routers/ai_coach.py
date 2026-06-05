from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
import json
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database.connection import get_db
from database import models
import crud

load_dotenv()

router = APIRouter(prefix="/ai-coach")

class ChatRequest(BaseModel):
    message: str
    workspace_name: str
    workspace_mode: str
    focus_minutes: int
    distraction_count: int
    burnout_probability: float
    current_state: str
    session_count: int

class FunctionCallRequest(BaseModel):
    message: str

class WorkspaceCreationIntent(BaseModel):
    name: str
    mode: str
    work_duration: int = 45
    break_duration: int = 5
    user_id: int = 1

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        system_prompt = f"""
        You are an elite AI performance coach inside Prodify. Current session data:
        - Workspace: {request.workspace_name} ({request.workspace_mode})
        - Focus time: {request.focus_minutes} minutes
        - Distractions: {request.distraction_count}
        - Burnout risk: {request.burnout_probability}%
        - Timer state: {request.current_state}
        - Sessions completed: {request.session_count}

        Analyze this data and give sharp, data-driven advice. Be direct, empathetic and specific.
        Keep responses under 4 sentences. If burnout > 70% warn strongly.
        If asked about specific workspace performance answer based on the data provided.
        """

        from groq import Groq
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ]
        )

        return {"response": completion.choices[0].message.content}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FunctionCallResponse(BaseModel):
    intent: Optional[str] = None  # "create_workspace" or None
    workspace_config: Optional[WorkspaceCreationIntent] = None
    explanation: str

@router.post("/function-call", response_model=FunctionCallResponse)
async def ai_function_call(request: FunctionCallRequest, db: Session = Depends(get_db)):
    """
    AI-powered function calling endpoint.
    When a user says something like "Create a deep focus workspace for ML studying for 60 minutes",
    this endpoint parses the intent and can autonomously create the workspace.

    Uses Groq/LLM to extract structured intent from natural language.
    """
    try:
        system_prompt = """
        You are a workspace creation assistant for Prodify.
        Parse the user's message and extract workspace creation intent.

        Respond with ONLY valid JSON in this exact format (no markdown, no backticks):
        {
          "intent": "create_workspace" or null,
          "workspace_config": {
            "name": "string - descriptive workspace name",
            "mode": "Structured Goal Mode" or "Flexible Tracking Mode",
            "work_duration": number (default 45, must be 1-180),
            "break_duration": number (default 5, must be 1-60),
            "user_id": 1
          },
          "explanation": "string - brief explanation of what was parsed"
        }

        If the message is not about creating a workspace, set intent to null.
        If work duration is specified in the message, extract it (e.g. "60 minutes" -> 60).
        """

        from groq import Groq
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            response_format={"type": "json_object"}
        )

        result = json.loads(completion.choices[0].message.content)

        # If intent is to create a workspace, proceed autonomously
        if result.get("intent") == "create_workspace":
            config = result.get("workspace_config", {})
            work_duration = max(1, min(180, config.get("work_duration", 45)))
            break_duration = max(1, min(60, config.get("break_duration", 5)))

            # Ensure default user exists
            user = db.query(models.User).filter(models.User.id == 1).first()
            if not user:
                user = models.User(
                    id=1,
                    username="default_user",
                    email="default@prodify.local",
                    hashed_password="default",
                )
                db.add(user)
                db.commit()

            workspace = crud.create_workspace(
                db=db,
                user_id=config.get("user_id", 1),
                name=config.get("name", "AI Generated Workspace"),
                mode=config.get("mode", "Structured Goal Mode"),
                work_duration=work_duration,
                break_duration=break_duration,
            )

            return FunctionCallResponse(
                intent="create_workspace",
                workspace_config=WorkspaceCreationIntent(
                    name=workspace.name,
                    mode=workspace.mode,
                    work_duration=workspace.work_duration,
                    break_duration=workspace.break_duration,
                    user_id=workspace.user_id,
                ),
                explanation=result.get("explanation", f"Workspace '{workspace.name}' created successfully!")
            )

        return FunctionCallResponse(
            intent=None,
            workspace_config=None,
            explanation=result.get("explanation", "No workspace creation intent detected.")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))