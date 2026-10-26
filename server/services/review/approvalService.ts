import { ApprovalDecision, ReviewDraft, UserProfile } from '../../types'
import { reviewRepo } from '../../db/repositories/reviewRepo'
import { auditRepo } from '../../db/repositories/auditRepo'
import { validateTransition } from './stateMachine'
import { NotFoundError } from '../errors'

export const approvalService = {
  /**
   * Submits a formal human approval/rejection decision, enforcing legal state transitions,
   * persisting the decision, and logging an immutable audit record.
   */
  async processDecision(
    reviewId: string,
    decision: ApprovalDecision,
    actor: UserProfile
  ): Promise<ReviewDraft> {
    const existing = await reviewRepo.getReviewById(reviewId)
    if (!existing) {
      throw new NotFoundError('ReviewDraft', reviewId)
    }

    // 1. Enforce state machine transition and user authority
    validateTransition(existing.status, decision.decision, actor.role)

    // 2. Persist decision in database repository
    const updated = await reviewRepo.submitDecision(reviewId, decision)

    // 3. Map decision to audit action type
    const actionTypeMap: Record<ApprovalDecision['decision'], 'approval_decision' | 'rejection_decision' | 'revisions_requested'> = {
      approved: 'approval_decision',
      rejected: 'rejection_decision',
      changes_requested: 'revisions_requested',
    }

    const actionType = actionTypeMap[decision.decision]

    // 4. Record immutable audit event
    await auditRepo.recordAuditEvent({
      actionType,
      actor: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
      targetType: 'review',
      targetId: reviewId,
      targetTitle: existing.title,
      summary: `Review status changed to '${decision.decision}': ${decision.comments || 'No comments provided.'}`,
      metadata: {
        previousStatus: existing.status,
        newStatus: decision.decision,
        reviewerId: actor.id,
      },
    })

    return updated
  },

  /**
   * Applies an AI finding suggestion to the live draft, updates finding status,
   * recalculates compliance metrics, and logs an audit trail event.
   */
  async applyFindingSuggestion(
    reviewId: string,
    findingId: string,
    actor: UserProfile,
    customText?: string
  ): Promise<ReviewDraft> {
    const existing = await reviewRepo.getReviewById(reviewId)
    if (!existing) throw new NotFoundError('ReviewDraft', reviewId)

    const updated = await reviewRepo.applySuggestion(reviewId, findingId, customText)

    await auditRepo.recordAuditEvent({
      actionType: customText ? 'suggestion_edited' : 'suggestion_accepted',
      actor: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
      targetType: 'review',
      targetId: reviewId,
      targetTitle: existing.title,
      summary: customText
        ? `Edited and applied correction for finding ${findingId}: "${customText}"`
        : `Accepted AI suggested correction for finding ${findingId}`,
      metadata: {
        findingId,
        customText,
      },
    })

    return updated
  },

  /**
   * Rejects an AI finding suggestion without applying it to the draft text.
   */
  async rejectFindingSuggestion(
    reviewId: string,
    findingId: string,
    actor: UserProfile
  ): Promise<ReviewDraft> {
    const existing = await reviewRepo.getReviewById(reviewId)
    if (!existing) throw new NotFoundError('ReviewDraft', reviewId)

    const updated = await reviewRepo.rejectSuggestion(reviewId, findingId)

    await auditRepo.recordAuditEvent({
      actionType: 'suggestion_rejected',
      actor: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
      targetType: 'review',
      targetId: reviewId,
      targetTitle: existing.title,
      summary: `Rejected suggested correction for finding ${findingId}`,
      metadata: { findingId },
    })

    return updated
  },
}
