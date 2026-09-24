require("dotenv").config()
const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { toGeminiSchema } = require("../src/services/ai.service")

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

const groundingSchema = z.object({
    skillGaps: z.object({
        score: z.number(),
        flagged: z.array(z.string())
    }),
    technicalQuestions: z.object({
        score: z.number(),
        flagged: z.array(z.string())
    }),
    behavioralQuestions: z.object({
        score: z.number(),
        flagged: z.array(z.string())
    })
})

async function checkGrounding({ jobDescription, resume, report }) {
    const prompt = `You are critiquing an AI-generated interview report for factual grounding.
Job Description: ${jobDescription}
Resume: ${resume || "Not provided"}

Skill Gaps: ${JSON.stringify(report.skillGaps)}
Technical Questions: ${JSON.stringify(report.technicalQuestions.map(q => q.question))}
Behavioral Questions: ${JSON.stringify(report.behavioralQuestions.map(q => q.question))}

For each section (skillGaps, technicalQuestions, behavioralQuestions), give a 0-100 confidence score that the content is clearly supported by the Job Description/Resume text, and list any specific items (skill name or exact question text) that are NOT clearly supported.`

    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
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

            const text = response.text || response.candidates[0].content.parts[0].text
            const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
            return JSON.parse(cleaned)
        } catch (err) {
            if (attempt === 4) throw err
            console.log(`[Attempt ${attempt} encountered spike, retrying in ${attempt * 1.5}s...]`)
            await new Promise(r => setTimeout(r, attempt * 1500))
        }
    }
}

async function testGroundingDetection() {
    console.log("\n========================================================")
    console.log("BENCHMARK 3: Grounding Detection (Planted Hallucinations)")
    console.log("========================================================")

    const jd = "Senior Frontend Engineer with 5+ years of React, TypeScript, Redux, and CSS experience."
    const resume = "Frontend developer with 4 years React and TypeScript experience. Worked with Redux and responsive CSS."

    // Report with 2 valid skills + 2 planted hallucinations
    // And 2 valid questions + 2 planted hallucinations
    const fakeReport = {
        skillGaps: [
            { skill: "Web Accessibility (WCAG standards)", severity: "medium" }, // Validly supported (mentioned in standard JD or missing in resume)
            { skill: "Quantum Computing Algorithms (Qiskit)", severity: "high" }, // PLANTED HALLUCINATION
            { skill: "Rust Kernel Driver Development", severity: "high" }         // PLANTED HALLUCINATION
        ],
        technicalQuestions: [
            { question: "How does React fiber architecture handle reconciliation?", intention: "React knowledge", answer: "Virtual DOM reconciliation" },
            { question: "Can you explain the difference between Redux Toolkit createSlice and standard reducers?", intention: "Redux architecture", answer: "Redux structure" },
            { question: "How would you tune COBOL mainframe database transactions for ultra-low latency banking?", intention: "Testing COBOL", answer: "Mainframe optimization" }, // PLANTED HALLUCINATION
            { question: "Describe how you write Linux assembly drivers for proprietary PCI hardware.", intention: "Hardware drivers", answer: "Hardware driver code" } // PLANTED HALLUCINATION
        ],
        behavioralQuestions: [
            { question: "Tell me about a time you resolved a conflict between frontend and backend engineers.", intention: "Collaboration", answer: "STAR approach" },
            { question: "Describe your experience negotiating multimillion-dollar aerospace defense contracts with the Pentagon.", intention: "Defense contracts", answer: "Contract negotiation" } // PLANTED HALLUCINATION
        ]
    }

    const result = await checkGrounding({ jobDescription: jd, resume, report: fakeReport })
    console.log("\nGrounding Results from Critic Model:")
    console.log("Skill Gaps Score:", result.skillGaps.score, "%")
    console.log("Skill Gaps Flagged:", result.skillGaps.flagged)
    console.log("\nTech Qs Score:", result.technicalQuestions.score, "%")
    console.log("Tech Qs Flagged:", result.technicalQuestions.flagged)
    console.log("\nBehavioral Qs Score:", result.behavioralQuestions.score, "%")
    console.log("Behavioral Qs Flagged:", result.behavioralQuestions.flagged)

    const planted = [
        "Quantum Computing Algorithms (Qiskit)",
        "Rust Kernel Driver Development",
        "COBOL mainframe database transactions",
        "Linux assembly drivers",
        "multimillion-dollar aerospace defense contracts"
    ]

    const allFlagged = [
        ...result.skillGaps.flagged,
        ...result.technicalQuestions.flagged,
        ...result.behavioralQuestions.flagged
    ].join(" ").toLowerCase()

    let caught = 0
    for (const p of planted) {
        const keywords = p.toLowerCase().split(" ").filter(w => w.length > 4)
        const match = keywords.some(k => allFlagged.includes(k))
        if (match) caught++
        console.log(`- Planted item "${p}": ${match ? "CAUGHT & FLAGGED" : "MISSED"}`)
    }

    console.log(`\nPlanted Detection Rate: ${caught}/${planted.length} (${Math.round((caught / planted.length) * 100)}%)`)
}

testGroundingDetection().catch(err => console.error("Error in benchmark:", err))
