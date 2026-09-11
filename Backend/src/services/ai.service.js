const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")
const AIGenerationError = require("../errors/AIGenerationError")
const generationLogModel = require("../models/generationLog.model")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry(fn, maxAttempts = 3) {
    let lastError
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await fn()
            return { result, attempts: attempt }
        } catch (err) {
            lastError = err
            if (attempt < maxAttempts) {
                await sleep(500 * 2 ** (attempt - 1))
            }
        }
    }
    throw Object.assign(lastError, { attempts: maxAttempts })
}


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

const groundingSchema = z.object({
    skillGaps: z.object({
        score: z.number().describe("Confidence score 0-100 that the skill gaps are supported by the resume/JD"),
        flagged: z.array(z.string()).describe("Skills flagged as not clearly supported by the resume/JD")
    }),
    technicalQuestions: z.object({
        score: z.number().describe("Confidence score 0-100 that the technical questions are grounded in the JD"),
        flagged: z.array(z.string()).describe("Technical questions flagged as not clearly grounded in the JD")
    }),
    behavioralQuestions: z.object({
        score: z.number().describe("Confidence score 0-100 that the behavioral questions are grounded in the JD"),
        flagged: z.array(z.string()).describe("Behavioral questions flagged as not clearly grounded in the JD")
    })
})

async function generateInterviewReport({ resume, selfDescription, jobDescription, userId }) {

    const prompt = `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}
`

    let lastRawResponse

    try {
        const { result, attempts } = await withRetry(async () => {
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: zodToJsonSchema(interviewReportSchema),
                }
            })
            lastRawResponse = response.text
            const parsed = JSON.parse(response.text)
            return interviewReportSchema.parse(parsed)
        })

        let grounding
        try {
            grounding = await checkGrounding({ jobDescription, resume, report: result })
        } catch (err) {
            grounding = undefined
        }

        await generationLogModel.create({
            user: userId,
            prompt,
            rawResponse: lastRawResponse,
            validatedOutput: result,
            status: "success",
            attempts
        })

        return { ...result, grounding }
    } catch (err) {
        await generationLogModel.create({
            user: userId,
            prompt,
            rawResponse: lastRawResponse,
            validatedOutput: null,
            status: "failure",
            attempts: err.attempts || 3
        })
        throw new AIGenerationError("Failed to generate interview report after multiple attempts. Please try again.", { attempts: err.attempts || 3, cause: err })
    }
}

async function checkGrounding({ jobDescription, resume, report }) {
    const prompt = `You are critiquing an AI-generated interview report for factual grounding.
Job Description: ${jobDescription}
Resume: ${resume}

Skill Gaps: ${JSON.stringify(report.skillGaps)}
Technical Questions: ${JSON.stringify(report.technicalQuestions.map(q => q.question))}
Behavioral Questions: ${JSON.stringify(report.behavioralQuestions.map(q => q.question))}

For each section (skillGaps, technicalQuestions, behavioralQuestions), give a 0-100 confidence score that the content is clearly supported by the Job Description/Resume text, and list any specific items (skill name or exact question text) that are NOT clearly supported.`

    const { result } = await withRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(groundingSchema),
            }
        })
        const parsed = JSON.parse(response.text)
        return groundingSchema.parse(parsed)
    }, 2)

    return result
}



async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema),
        }
    })


    const jsonContent = JSON.parse(response.text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf, interviewReportSchema }