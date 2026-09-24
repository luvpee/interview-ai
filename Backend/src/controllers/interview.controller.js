const { PDFParse } = require("pdf-parse")
const { generateInterviewReport, generateResumePdf } = require("../services/ai.service")
const interviewReportModel = require("../models/interviewReport.model")
const AIGenerationError = require("../errors/AIGenerationError")

/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */
async function generateInterViewReportController(req, res) {

    try {
        let resumeContent = "";
        if(req.file)
        {
            try {
                const parser = new PDFParse({ data: req.file.buffer })
                const data = await parser.getText()
                await parser.destroy()
                resumeContent = data.text
            } catch (parseErr) {
                console.error("PDF Parsing Error:", parseErr)
            }
        }
        const { selfDescription, jobDescription } = req.body

        const interViewReportByAi = await generateInterviewReport({
            resume: resumeContent,
            selfDescription,
            jobDescription,
            userId: req.user.id
        })

        const interviewReport = await interviewReportModel.create({
            user: req.user.id,
            resume: resumeContent,
            selfDescription,
            jobDescription,
            ...interViewReportByAi
        })

        res.status(201).json({
            message: "Interview report generated successfully.",
            interviewReport
        })
    } catch (err) {
        console.error(err);
        if (err instanceof AIGenerationError) {
            return res.status(err.statusCode).json({ message: err.message })
        }
        res.status(500).json({ message: "Something went wrong while generating the interview report. Please try again." })
    }

}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res) {

    const { interviewId } = req.params

    const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id })

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    res.status(200).json({
        message: "Interview report fetched successfully.",
        interviewReport
    })
}


/** 
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res) {
    const interviewReports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })
}


/**
 * @description Controller to generate resume PDF based on user self description, resume and job description.
 */
async function generateResumePdfController(req, res) {
    try {
        const { interviewReportId } = req.params

        const interviewReport = await interviewReportModel.findOne({ _id: interviewReportId, user: req.user.id })

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        const { resume, jobDescription, selfDescription } = interviewReport

        const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription })

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`,
            "Content-Length": pdfBuffer.length
        })

        return res.send(pdfBuffer)
    } catch (err) {
        console.error("Error generating resume PDF:", err)
        return res.status(500).json({
            message: err?.message || "Failed to generate resume PDF. Please try again."
        })
    }
}

/**
 * @description Controller to submit thumbs up/down feedback for a specific question in an interview report.
 */
async function submitFeedbackController(req, res) {
    const { interviewId } = req.params
    const { type, questionIndex, rating } = req.body

    if (!["technical", "behavioral"].includes(type) || typeof questionIndex !== "number" || ![ "up", "down", null ].includes(rating)) {
        return res.status(400).json({ message: "Invalid feedback payload." })
    }

    const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id })

    if (!interviewReport) {
        return res.status(404).json({ message: "Interview report not found." })
    }

    const questionsArr = type === "technical" ? interviewReport.technicalQuestions : interviewReport.behavioralQuestions
    const question = questionsArr[ questionIndex ]

    if (!question) {
        return res.status(400).json({ message: "Question not found." })
    }

    const existing = interviewReport.feedback.find(f => f.type === type && f.questionIndex === questionIndex)

    if (existing) {
        existing.rating = rating
        existing.timestamp = new Date()
    } else {
        interviewReport.feedback.push({
            type,
            questionIndex,
            questionText: question.question,
            rating,
            timestamp: new Date()
        })
    }

    await interviewReport.save()

    res.status(200).json({
        message: "Feedback recorded successfully.",
        feedback: interviewReport.feedback
    })
}

/**
 * @description Controller to get aggregated analytics (match score trend, top skill gaps) for the logged in user's reports.
 */
async function getAnalyticsController(req, res) {
    const reports = await interviewReportModel.find({ user: req.user.id }).select("matchScore skillGaps createdAt").sort({ createdAt: 1 })

    const matchScoreTrend = reports.map(r => ({ date: r.createdAt, matchScore: r.matchScore }))

    const skillGapCounts = {}
    reports.forEach(r => {
        r.skillGaps.forEach(g => {
            skillGapCounts[ g.skill ] = (skillGapCounts[ g.skill ] || 0) + 1
        })
    })
    const topSkillGaps = Object.entries(skillGapCounts)
        .sort((a, b) => b[ 1 ] - a[ 1 ])
        .slice(0, 10)
        .map(([ skill, count ]) => ({ skill, count }))

    res.status(200).json({
        message: "Analytics fetched successfully.",
        matchScoreTrend,
        topSkillGaps
    })
}

module.exports = { generateInterViewReportController, getInterviewReportByIdController, getAllInterviewReportsController, generateResumePdfController, submitFeedbackController, getAnalyticsController }