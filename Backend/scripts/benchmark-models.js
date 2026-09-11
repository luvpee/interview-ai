require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { GoogleGenAI } = require("@google/genai")
const { zodToJsonSchema } = require("zod-to-json-schema")
const { interviewReportSchema } = require("../src/services/ai.service")

const FIXTURES_DIR = path.join(__dirname, "fixtures")
const OUTPUT_FILE = path.join(__dirname, "benchmark-results.json")

function loadFixtures() {
    return fs.readdirSync(FIXTURES_DIR)
        .filter(f => f.endsWith(".json"))
        .sort()
        .map(f => ({ name: f, ...JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf-8")) }))
}

function buildPrompt(jobDescription, resume) {
    return `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description:
                        Job Description: ${jobDescription}
`
}

function extractKeywords(text) {
    return new Set(
        (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 3)
    )
}

function groundingHeuristicScore(jobDescription, report) {
    const jdKeywords = extractKeywords(jobDescription)
    const generatedText = [
        ...(report.skillGaps || []).map(s => s.skill),
        ...(report.technicalQuestions || []).map(q => q.question),
        ...(report.behavioralQuestions || []).map(q => q.question)
    ].join(" ")
    const generatedKeywords = extractKeywords(generatedText)
    if (generatedKeywords.size === 0) return 0
    let matched = 0
    for (const word of generatedKeywords) {
        if (jdKeywords.has(word)) matched++
    }
    return Math.round((matched / generatedKeywords.size) * 100)
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

const providers = {
    google: async (jobDescription, resume) => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: buildPrompt(jobDescription, resume),
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(interviewReportSchema),
            }
        })
        return JSON.parse(response.text)
    },
    openai: async (jobDescription, resume) => {
        const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "You generate interview report JSON with fields: matchScore (0-100 number), technicalQuestions ([{question,intention,answer}]), behavioralQuestions ([{question,intention,answer}]), skillGaps ([{skill,severity:low|medium|high}]), preparationPlan ([{day,focus,tasks:[string]}]), title (string). Respond with only that JSON object." },
                    { role: "user", content: buildPrompt(jobDescription, resume) }
                ]
            })
        })
        if (!res.ok) {
            throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`)
        }
        const data = await res.json()
        return JSON.parse(data.choices[ 0 ].message.content)
    }
}

async function benchmarkOne(providerName, providerFn, fixture) {
    const start = Date.now()
    try {
        const report = await providerFn(fixture.jobDescription, fixture.resume)
        const latencyMs = Date.now() - start
        const validation = interviewReportSchema.safeParse(report)
        return {
            fixture: fixture.name,
            provider: providerName,
            latencyMs,
            validationPassed: validation.success,
            groundingHeuristicScore: groundingHeuristicScore(fixture.jobDescription, report),
            error: validation.success ? "" : "schema validation failed"
        }
    } catch (err) {
        return {
            fixture: fixture.name,
            provider: providerName,
            latencyMs: Date.now() - start,
            validationPassed: false,
            groundingHeuristicScore: 0,
            error: err.message
        }
    }
}

async function main() {
    const fixtures = loadFixtures()
    const activeProviders = { google: providers.google }
    if (process.env.OPENAI_API_KEY) {
        activeProviders.openai = providers.openai
    } else {
        console.log("OPENAI_API_KEY not set - skipping OpenAI provider. Add a key to compare a second provider.")
    }

    const results = []
    for (const fixture of fixtures) {
        for (const [ providerName, providerFn ] of Object.entries(activeProviders)) {
            const result = await benchmarkOne(providerName, providerFn, fixture)
            results.push(result)
        }
    }

    console.table(results)
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2))
    console.log(`\nResults written to ${OUTPUT_FILE}`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
