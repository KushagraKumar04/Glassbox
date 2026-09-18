"""
Template endpoints.

    GET    /api/v1/templates                 list (built-ins + current user's)
    POST   /api/v1/templates                 create a user template
    GET    /api/v1/templates/{id}            fetch one
    PATCH  /api/v1/templates/{id}            update a user template
    POST   /api/v1/templates/{id}/use        increment usage_count
    DELETE /api/v1/templates/{id}            delete a user template

Built-ins (is_builtin=True) are read-only — PATCH/DELETE return 403.
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.db.models import Template, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import TemplateIn, TemplateOut

router = APIRouter(prefix="/templates", tags=["templates"])
log = structlog.get_logger()


def _visible_query(user_id: str):
    """Built-ins (user_id NULL) plus templates owned by the current user."""
    return select(Template).where(
        or_(Template.user_id.is_(None), Template.user_id == user_id)
    )


async def _get_visible_or_404(
    template_id: str, user_id: str, session: AsyncSession
) -> Template:
    tpl = await session.get(Template, template_id)
    if tpl is None:
        raise HTTPException(404, "Template not found")
    if tpl.user_id is not None and tpl.user_id != user_id:
        # Don't leak existence across users
        raise HTTPException(404, "Template not found")
    return tpl


# ── List ─────────────────────────────────────────────────

@router.get("", response_model=list[TemplateOut])
async def list_templates(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        _visible_query(user.id).order_by(
            Template.is_builtin.desc(),  # built-ins first
            Template.usage_count.desc(),
            Template.created_at.desc(),
        )
    )
    return [TemplateOut(**t.to_dict()) for t in result.scalars().all()]


# ── Create ───────────────────────────────────────────────

@router.post("", response_model=TemplateOut)
async def create_template(
    request: Request,
    req: TemplateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Prevent duplicates per user
    existing = await session.execute(
        select(Template).where(
            Template.user_id == user.id,
            Template.name == req.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            409, f"You already have a template named '{req.name}'."
        )

    tpl = Template(
        user_id=user.id,
        name=req.name.strip(),
        description=req.description.strip(),
        question=req.question.strip(),
        tags=[t.strip() for t in req.tags if t and t.strip()][:8],
        is_builtin=False,
    )
    session.add(tpl)
    await session.commit()
    await session.refresh(tpl)
    log.info("template_created", template_id=tpl.id, user_id=user.id)

    await audit(
        "template.create",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="template",
        target_id=tpl.id,
        details={"name": tpl.name},
    )

    return TemplateOut(**tpl.to_dict())


# ── Read one ─────────────────────────────────────────────

@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tpl = await _get_visible_or_404(template_id, user.id, session)
    return TemplateOut(**tpl.to_dict())


# ── Update ───────────────────────────────────────────────

@router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(
    request: Request,
    template_id: str,
    req: TemplateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tpl = await _get_visible_or_404(template_id, user.id, session)
    if tpl.is_builtin or tpl.user_id is None:
        raise HTTPException(403, "Built-in templates are read-only.")

    tpl.name = req.name.strip()
    tpl.description = req.description.strip()
    tpl.question = req.question.strip()
    tpl.tags = [t.strip() for t in req.tags if t and t.strip()][:8]

    await session.commit()
    await session.refresh(tpl)

    await audit(
        "template.update",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="template",
        target_id=template_id,
        details={"name": tpl.name},
    )

    return TemplateOut(**tpl.to_dict())


# ── Use (bump usage) ─────────────────────────────────────

@router.post("/{template_id}/use", response_model=TemplateOut)
async def use_template(
    template_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tpl = await _get_visible_or_404(template_id, user.id, session)
    tpl.usage_count = (tpl.usage_count or 0) + 1
    await session.commit()
    await session.refresh(tpl)
    return TemplateOut(**tpl.to_dict())


# ── Delete ───────────────────────────────────────────────

@router.delete("/{template_id}")
async def delete_template(
    request: Request,
    template_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tpl = await _get_visible_or_404(template_id, user.id, session)
    if tpl.is_builtin or tpl.user_id is None:
        raise HTTPException(403, "Built-in templates cannot be deleted.")
    await session.delete(tpl)
    await session.commit()

    await audit(
        "template.delete",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="template",
        target_id=template_id,
        details={"name": tpl.name},
    )

    return {"deleted": template_id}