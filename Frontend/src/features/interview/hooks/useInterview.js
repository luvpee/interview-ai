import { getAllInterviewReports, generateInterviewReport, getInterviewReportById, generateResumePdf, submitFeedback } from "../services/interview.api"
import { useContext, useEffect } from "react"
import { InterviewContext } from "../interview.context"
import { useParams } from "react-router"


export const useInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId } = useParams()

    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider")
    }

    const {
        loading, setLoading,
        downloadingResume, setDownloadingResume,
        downloadError, setDownloadError,
        report, setReport,
        reports, setReports
    } = context

    const generateReport = async ({ jobDescription, selfDescription, resumeFile }) => {
        setLoading(true)
        try {
            const response = await generateInterviewReport({ jobDescription, selfDescription, resumeFile })
            setReport(response.interviewReport)
            return response.interviewReport
        } finally {
            setLoading(false)
        }
    }

    const submitQuestionFeedback = async ({ interviewId, type, questionIndex, rating }) => {
        const previousReport = report
        const updatedFeedback = [ ...(report.feedback || []) ]
        const existingIndex = updatedFeedback.findIndex(f => f.type === type && f.questionIndex === questionIndex)
        if (existingIndex > -1) {
            updatedFeedback[ existingIndex ] = { ...updatedFeedback[ existingIndex ], rating }
        } else {
            updatedFeedback.push({ type, questionIndex, rating })
        }
        setReport({ ...report, feedback: updatedFeedback })

        try {
            await submitFeedback({ interviewId, type, questionIndex, rating })
        } catch (error) {
            setReport(previousReport)
            throw error
        }
    }

    const getReportById = async (interviewId) => {
        setLoading(true)
        let response = null
        try {
            response = await getInterviewReportById(interviewId)
            setReport(response.interviewReport)
        } catch (error) {
            console.log(error)
        } finally {
            setLoading(false)
        }
        return response.interviewReport
    }

    const getReports = async () => {
        setLoading(true)
        let response = null
        try {
            response = await getAllInterviewReports()
            setReports(response.interviewReports)
        } catch (error) {
            console.log(error)
        } finally {
            setLoading(false)
        }

        return response.interviewReports
    }

    const getResumePdf = async (interviewReportId) => {
        setDownloadingResume(true)
        setDownloadError("")
        try {
            const blobData = await generateResumePdf({ interviewReportId })
            const blob = new Blob([ blobData ], { type: "application/pdf" })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.setAttribute("download", `resume_${interviewReportId}.pdf`)
            document.body.appendChild(link)
            link.click()
            setTimeout(() => {
                link.remove()
                window.URL.revokeObjectURL(url)
            }, 100)
            return true
        } catch (error) {
            console.error("Resume download error:", error)
            const message = error?.message || error?.response?.data?.message || "Failed to download resume. Please try again."
            setDownloadError(message)
            throw error
        } finally {
            setDownloadingResume(false)
        }
    }

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        } else {
            getReports()
        }
    }, [ interviewId ])

    return {
        loading,
        downloadingResume,
        downloadError,
        setDownloadError,
        report,
        reports,
        generateReport,
        getReportById,
        getReports,
        getResumePdf,
        submitQuestionFeedback
    }

}