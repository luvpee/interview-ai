const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const puppeteer = require("puppeteer")
const AIGenerationError = require("../errors/AIGenerationError")
const generationLogModel = require("../models/generationLog.model")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

/**
 * Convert a Zod schema to a JSON Schema compatible with Gemini's responseSchema.
 * Strips '$schema' and 'additionalProperties' keys that Gemini doesn't support.
 */
function toGeminiSchema(zodSchema) {
    const jsonSchema = z.toJSONSchema(zodSchema)
    const clone = JSON.parse(JSON.stringify(jsonSchema))
    delete clone["$schema"]
    function removeAdditionalProperties(obj) {
        if (obj && typeof obj === "object") {
            delete obj.additionalProperties
            for (const val of Object.values(obj)) {
                removeAdditionalProperties(val)
            }
        }
    }
    removeAdditionalProperties(clone)
    return clone
}

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
                await sleep(1000 * 2 ** (attempt - 1))
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

    const prompt = `You are an expert Technical Recruiter and Interview Coach. Generate a comprehensive, highly tailored interview preparation report.

    CANDIDATE DETAILS:
    - Resume: ${resume || "Not provided directly"}
    - Self Description: ${selfDescription || "Not provided"}

    JOB DETAILS:
    - Job Description: ${jobDescription}

    INSTRUCTIONS:
    1. Analyze the gap between the candidate's profile and the job requirements.
    2. Generate realistic technical and behavioral questions based on the specific JD and the candidate's experience.
    3. Create a practical, day-by-day preparation plan.
    4. Ensure the output strictly follows the provided JSON schema.
    `

    let lastRawResponse

    try {
        const { result, attempts } = await withRetry(async () => {
            let response
            try {
                response = await ai.models.generateContent({
                    model: "gemini-3.6-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: toGeminiSchema(interviewReportSchema),
                    }
                })
            } catch (apiErr) {
                console.warn("Primary model gemini-3.6-flash failed, trying fallback gemini-3-flash-preview...", apiErr?.message)
                response = await ai.models.generateContent({
                    model: "gemini-3-flash-preview",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: toGeminiSchema(interviewReportSchema),
                    }
                })
            }

            const responseText = response.text || (response.candidates && response.candidates[0]?.content?.parts[0]?.text);
            lastRawResponse = responseText;

            if (!responseText) {
                throw new Error("AI returned an empty response");
            }

            const cleaned = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
            const parsed = JSON.parse(cleaned);
            return interviewReportSchema.parse(parsed);
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
Resume: ${resume || "Not provided"}

Skill Gaps: ${JSON.stringify(report.skillGaps)}
Technical Questions: ${JSON.stringify(report.technicalQuestions.map(q => q.question))}
Behavioral Questions: ${JSON.stringify(report.behavioralQuestions.map(q => q.question))}

For each section (skillGaps, technicalQuestions, behavioralQuestions), give a 0-100 confidence score that the content is clearly supported by the Job Description/Resume text, and list any specific items (skill name or exact question text) that are NOT clearly supported.`

    const { result } = await withRetry(async () => {
        let response
        try {
            response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: toGeminiSchema(groundingSchema),
                }
            })
        } catch {
            response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: toGeminiSchema(groundingSchema),
                }
            })
        }

        const responseText = response.text || (response.candidates && response.candidates[0]?.content?.parts[0]?.text);
        if (!responseText) throw new Error("AI returned an empty response");
        const cleaned = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
        const parsed = JSON.parse(cleaned);
        return groundingSchema.parse(parsed);
    }, 2)

    return result
}



async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    })
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 30000 })

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "15mm",
                bottom: "15mm",
                left: "15mm",
                right: "15mm"
            }
        })

        return pdfBuffer
    } finally {
        await browser.close()
    }
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The complete HTML content of the resume with modern embedded CSS styling in <style>, optimized for printing to A4 PDF")
    })

    const prompt = `You are an expert Executive Resume Writer. Generate a comprehensive, professional resume in HTML for a candidate with the following details:

    Candidate Resume / Notes: ${resume || "Not provided directly. Use the candidate self description and job requirements to craft their profile."}
    Candidate Self Description: ${selfDescription || "Not provided"}
    Target Job Description: ${jobDescription || "Not provided"}

    INSTRUCTIONS:
    1. Respond with a JSON object strictly having a single field "html".
    2. The "html" field must be a complete, well-structured HTML document with <!DOCTYPE html><html><head><style>...</style></head><body>...</body></html>.
    3. Include professional resume sections: Header (Name, Title, Contact Info), Professional Summary, Core Competencies/Skills, Professional Experience (with bullet points highlighting achievements), Projects, and Education.
    4. Style it with clean, modern CSS: elegant typography (system fonts/Arial/Helvetica), high-contrast text, clear section dividers, clean spacing.
    5. The resume should be tailored to the target job description to maximize ATS score and recruiter appeal.
    6. Ensure the layout fits cleanly across 1 to 2 pages when printed to A4.
    7. Do NOT include markdown code fences or backticks inside the html field.
    `

    const { result } = await withRetry(async () => {
        let response
        try {
            response = await ai.models.generateContent({
                model: "gemini-3.6-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: toGeminiSchema(resumePdfSchema),
                }
            })
        } catch (apiErr) {
            console.warn("Primary model failed in generateResumePdf, attempting fallback gemini-3-flash-preview...", apiErr?.message)
            response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: toGeminiSchema(resumePdfSchema),
                }
            })
        }

        const responseText = response.text || (response.candidates && response.candidates[0]?.content?.parts[0]?.text)
        if (!responseText) throw new Error("Empty response from AI for resume generation")

        const cleaned = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
        const parsed = JSON.parse(cleaned)
        if (!parsed.html) throw new Error("Resume HTML content is missing from AI response")
        return parsed
    }, 3)

    const pdfBuffer = await generatePdfFromHtml(result.html)
    return pdfBuffer
}

module.exports = { generateInterviewReport, generateResumePdf, checkGrounding, withRetry, interviewReportSchema, toGeminiSchema }