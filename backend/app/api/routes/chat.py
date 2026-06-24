import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.models.chat import ChatMessage, ChatThread
from app.models.household import Household
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse, ChatThreadOut
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/threads", response_model=list[ChatThreadOut])
async def list_threads(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread)
        .where(ChatThread.user_id == user.id)
        .options(selectinload(ChatThread.messages))
        .order_by(ChatThread.updated_at.desc())
        .limit(20)
    )
    return result.scalars().all()


@router.get("/threads/{thread_id}", response_model=ChatThreadOut)
async def get_thread(
    thread_id: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread)
        .where(ChatThread.id == thread_id, ChatThread.user_id == user.id)
        .options(selectinload(ChatThread.messages))
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


@router.post("/message", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    # Get or create thread
    thread = None
    if body.thread_id:
        result = await db.execute(
            select(ChatThread).where(
                ChatThread.id == body.thread_id,
                ChatThread.user_id == user.id,
            )
        )
        thread = result.scalar_one_or_none()

    if not thread:
        thread = ChatThread(
            household_id=household.id,
            user_id=user.id,
            scope=body.scope,
            title=body.message[:60],
        )
        db.add(thread)
        await db.flush()

    # Save user message
    user_msg = ChatMessage(thread_id=thread.id, role="user", content=body.message)
    db.add(user_msg)
    await db.flush()

    # Generate AI response
    service = ChatService(db, household.id)
    response_text, sources, followups = await service.answer(body.message, thread.id)

    assistant_msg = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=response_text,
        sources=sources,
        suggested_followups=followups,
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)

    return ChatResponse(thread_id=thread.id, message=assistant_msg)


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == user.id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await db.delete(thread)
    await db.commit()
