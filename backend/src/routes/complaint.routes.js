const { Router } = require('express');
const {
  createComplaintController,
} = require('../controllers/complaint.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { validateBody } = require('../middleware/validateBody');
const { validateQuery } = require('../middleware/validateQuery');
const { validateParams } = require('../middleware/validateParams');
const { noQuery } = require('../validators/common.validators');
const {
  createComplaint,
  editComplaint,
  complaintFilters,
  commentInput,
  complaintParam,
  paginationQuery,
} = require('../validators/complaint.validators');
const {
  transitionInput,
  assignmentInput,
  priorityOverrideInput,
  reopenInput,
  feedbackInput,
} = require('../validators/workflow.validators');

function createComplaintRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createComplaintController(options.getServices);

  // Create complaint (Student only)
  router.post(
    '/',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.write,
    validateBody(createComplaint),
    controller.create
  );

  // Scoped list complaints
  router.get(
    '/',
    authenticate(options.getServices),
    options.limiters.read,
    validateQuery(complaintFilters),
    controller.list
  );

  // Detail of complaint
  router.get(
    '/:complaintId',
    authenticate(options.getServices),
    options.limiters.read,
    validateParams(complaintParam),
    noQuery,
    controller.detail
  );

  // Student edit original report
  router.patch(
    '/:complaintId',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(editComplaint),
    controller.edit
  );

  // List comments
  router.get(
    '/:complaintId/comments',
    authenticate(options.getServices),
    options.limiters.read,
    validateParams(complaintParam),
    validateQuery(paginationQuery),
    controller.listComments
  );

  // Add comment
  router.post(
    '/:complaintId/comments',
    authenticate(options.getServices),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(commentInput),
    controller.createComment
  );

  // List activity timeline
  router.get(
    '/:complaintId/activity',
    authenticate(options.getServices),
    options.limiters.read,
    validateParams(complaintParam),
    validateQuery(paginationQuery),
    controller.listActivities
  );

  // Transitions (Triage, Reject, Start Work, Resolve, Close)
  router.post(
    '/:complaintId/transitions',
    authenticate(options.getServices),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(transitionInput),
    controller.transition
  );

  // Assignment / Reassignment (Admin only)
  router.post(
    '/:complaintId/assignment',
    authenticate(options.getServices),
    requireRole('ADMIN'),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(assignmentInput),
    controller.assign
  );

  // Priority override (Admin only)
  router.post(
    '/:complaintId/priority',
    authenticate(options.getServices),
    requireRole('ADMIN'),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(priorityOverrideInput),
    controller.overridePriority
  );

  // Reopen complaint (Student only)
  router.post(
    '/:complaintId/reopen',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(reopenInput),
    controller.reopen
  );

  // Submit feedback (Student only)
  router.post(
    '/:complaintId/feedback',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.write,
    validateParams(complaintParam),
    validateBody(feedbackInput),
    controller.feedback
  );

  return router;
}

module.exports = { createComplaintRouter };
