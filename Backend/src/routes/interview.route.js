const express = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const interviewController = require("../controllers/interview.controller")
const upload = require("../middlewares/file.middleware")

const interviewRouter = express.Router()



/**
 * @route POST /api/interview/
 * @description generate new interview report on the basis of user self description,resume pdf and job description.
 * @access private
 */
interviewRouter.post("/", authMiddleware.authUser, upload.single("resume"), interviewController.generateInterViewReportController)

/**
 * @route GET /api/interview/report/:interviewId
 * @description get interview report by interviewId.
 * @access private
 */
interviewRouter.get("/report/:interviewId", authMiddleware.authUser, interviewController.getInterviewReportByIdController)


/**
 * @route GET /api/interview/
 * @description get all interview reports of logged in user.
 * @access private
 */
interviewRouter.get("/", authMiddleware.authUser, interviewController.getAllInterviewReportsController)


/**
 * @route GET /api/interview/resume/pdf
 * @description generate resume pdf on the basis of user self description, resume content and job description.
 * @access private
 */
interviewRouter.post("/resume/pdf/:interviewReportId", authMiddleware.authUser, interviewController.generateResumePdfController)

/**
 * @route POST /api/interview/report/:interviewId/feedback
 * @description submit thumbs up/down feedback for a specific question in an interview report.
 * @access private
 */
interviewRouter.post("/report/:interviewId/feedback", authMiddleware.authUser, interviewController.submitFeedbackController)

/**
 * @route GET /api/interview/analytics
 * @description get aggregated analytics (match score trend, top skill gaps) for the logged in user.
 * @access private
 */
interviewRouter.get("/analytics", authMiddleware.authUser, interviewController.getAnalyticsController)



module.exports = interviewRouter